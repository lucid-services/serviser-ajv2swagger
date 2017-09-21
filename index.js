const _ = require('lodash');

module.exports.toSwagger = toSwagger;
module.exports.convert = convert;

/**
 *
 * @param {String} id - schema id
 * @param {Ajv}    validator
 * @param {Int}    [oas=2] - open api (swagger) specification version (2|3)
 *
 * @return {Function} - function which returns swagger parameters collection {Array}
 */
function toSwagger(id, validator, oas) {
    var swagger
    ,   schema = validator.getSchema(id);

    if (!schema) {
        throw new Error(`Schema: ${id} not found`);
    }

    swagger = convert(schema.schema, oas);
    swagger = resolveSchemaRefs(swagger, validator);

    /**
     * @param {Object} options
     * @param {String} options.in - possible values: "formData", "body", "query", "path"
     * @return {Array}
     */
    return function toSwaggerJSON(options) {
        var out = [];

        options = options || {};

        // the `build` always returns swagger `body` payload format (in=body)
        // so we gotta handle conversion to the other formats (in=query|path|formData)
        if (   options.in !== 'body'
            && swagger.type === 'object'
            && !swagger.hasComplexDataStructures
        ) {
            var requiredProps = swagger.required || [];
            Object.keys(swagger.properties).forEach(function(name) {
                out.push(_.assign({
                    name: name,
                    in: options.in,
                    required: ~requiredProps.indexOf(name) ? true : false
                }, swagger.properties[name]));
            });
        } else {
            //fall back to POST JSON body payload if data are of complex type
            //and thus can't be described as simple form fields
            if (options.in === 'formData' && swagger.hasComplexDataStructures) {
                options.in = 'body';
            } else if(options.in !== 'body' && swagger.hasComplexDataStructures) {
                throw new Error('Swagger ' + options.in + ' parameter schema can NOT be constructed with complex data structures. Not supported.');
            }
            out.push(wrapSchema(swagger, options));
        }

        return out;
    }
}

/**
 * dereferences releative $refs and internal references to other ajv validator schemas
 * @param {Object|Array} val - value
 * @param {Ajv} validator
 * @param {Object|Array} _root - initial value
 * @return {Object}
 */
function resolveSchemaRefs(val, validator, _root) {

    _root = _root || val;
    resolve(val, '', val);
    return val;

    /*
     * @param {mixed} val
     * @param {String|Int} key
     * @param {Object|Array} object
     */
    function resolve(val, key, object) {
        if (_.isPlainObject(val)) {
            if (   val.hasOwnProperty('$ref')
                && typeof val.$ref === 'string'
            ) {

                var resolved;

                if (val.$ref.indexOf('#') === 0) {
                    let path = _.compact(val.$ref.slice(1).split('/'));
                    if (_.has(_root, path)) {
                        resolved = _.get(_root, path);
                        _.set(object, key, resolved);

                    }
                } else if ((resolved = validator.getSchema(val.$ref))) {
                    resolved = resolved.schema;
                    _.set(object, key, resolved);
                }

                do {
                    resolve(resolved, key, object);
                }
                while (   _.isPlainObject(object[key])
                         && object[key].hasOwnProperty('$ref')
                );
            } else {
                _.forOwn(val, resolve);
            }
        } else if (val instanceof Array) {
            val.forEach(resolve);
        }
        //can not return anything because of the lodash.forOwn
    }
}

/**
 *
 * @param {Object} schema
 * @param {Object} options
 * @param {String} options.in - possible values: "formData", "body", "query", "path"
 *
 * @return {Object}
 */
function wrapSchema(schema, options) {
    var out = {
        description: schema.description || '',
        in: options.in
    };

    if (options.in === 'body') {
        out.name = 'JSON payload';
        out.schema = _.cloneDeep(schema);
        out.required = schema.required instanceof Array ? schema.required.length > 0 : false;
    }

    return out;
}


/**
 * @param {Object} schema
 * @param {Int}    [oas=2] - open api (swagger) specification version (2|3)
 * @param {Object} _parentSchema
 */
function convert(schema, oas, _parentSchema) {
    oas = oas || 2;
    schema = _.clone(schema) || {};

    //make sure the `type` option is typeof string
    if (schema.hasOwnProperty('type')) {
        if (   schema.type instanceof Array
            && schema.type.length
            && schema.type.length <= 2
            && ~schema.type.indexOf('null')
        ) {
            if (oas >= 3) { //since OAS 3.x
                schema.nullable = true;
            }
            if (schema.type.length == 2) {
                schema.type.splice(schema.type.indexOf('null'), 1);
            }

            schema.type = schema.type.shift();
        } else if (schema.type instanceof Array && schema.type.length >= 2) {
            //OAS does not support multi-type properties
            //thus we must fallback to string type which can essentially be
            //enything (see https://github.com/OAI/OpenAPI-Specification/issues/229)
            schema.type = 'string';
        }
    }

    //convert $desc -> description
    if (schema.hasOwnProperty('$desc') && typeof schema.$desc === 'string') {
        schema.description = schema.$desc;
        delete schema.$desc;
    }

    //if the schema describes deep nested data structures, mark it as such
    //so we can later decide how we will present the schema
    if (_parentSchema && schema.type === 'object') {
        Object.defineProperty(
            _parentSchema,
            'hasComplexDataStructures',
            {
                enumerable: false,
                value: true
            }
        );
    }

    //Open API 2.0
    if (oas === 2) {
        //merge schemas into signle schema
        //(conditions are not supported in OAS 2.0)
        ['oneOf', 'anyOf'].forEach(function(keyword) {
            if (   schema.hasOwnProperty(keyword)
                && schema[keyword] instanceof Array
            ) {
                _.merge(schema, _.merge.apply(_, schema[keyword]));
                delete schema[keyword];
            }
        });


        //simplify the "allOf" structure if it's used only for data coerction
        //before validation
        if (   schema.hasOwnProperty('allOf')
            && schema['allOf'] instanceof Array
            && schema['allOf'].length === 2
            && _.isPlainObject(schema['allOf'][0])
            && _.isPlainObject(schema['allOf'][1])
            && Object.keys(schema['allOf'][0]).length === 1
            && schema['allOf'][0].hasOwnProperty('$toJSON')
        ) {
            _.merge(schema, schema['allOf'][1]);
            delete schema['allOf'];
        }
    }

    //recursively iterate throught schema
    [
        'properties',
        'patternProperties',
    ].forEach(function(keyword) {
        if (   typeof schema[keyword] === 'object'
            && _.isPlainObject(schema[keyword])
        ) {
            Object.keys(schema[keyword]).forEach(function(prop) {
                schema[keyword][prop] = convert(schema[keyword][prop], oas, schema);
            });
        }
    });

    [
        'items',
        'additionalProperties',
        'additionalItems'
    ].forEach(function(keyword) {
        if (   typeof schema[keyword] === 'object'
            && _.isPlainObject(schema[keyword])
        ) {
            schema[keyword] = convert(schema[keyword], oas, schema);
        }
    });

    return schema;
}
