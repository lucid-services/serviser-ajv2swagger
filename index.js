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
function toSwagger(id, validator, opt) {
    const swagger
    ,   schema = validator.getSchema(id);

    if (!schema) {
        throw new Error(`Schema: ${id} not found`);
    }

    swagger = convert(schema.schema);

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
            schema.nullable = true;
            if (schema.type.length == 2) {
                schema.type.splice(schema.type.indexOf('null'), 1);
            }

            schema.type = schema.type.shift();
        }
    }

    //convert $desc -> description
    if (schema.hasOwnProperty('$desc') && typeof schema.$desc === 'string') {
        schema.description = schema.$desc;
        delete schema.$desc;
    }

    //if the schema describes deep nested data structures, mark it as such
    //so we can later decide how we will present the schema
    if (_parentSchema) {
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
            }
        });
    }

    //recursively iterate throught schema
    ['properties', 'items', 'additionalProperties'].forEach(function(keyword) {
        if (   typeof schema[keyword] === 'object'
            && schema[keyword] !== null
            && !Array.isArray(schema[keyword])
        ) {
            Object.keys(schema[keyword]).forEach(function(prop) {
                schema[keyword][prop] = convert(schema[keyword][prop], oas, schema);
            });
        }
    })
}
