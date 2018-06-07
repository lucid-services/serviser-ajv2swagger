## 0.2.5

* [FIXED] - `allOf` should be flatten/simplified when it has only single schema element

## 0.2.4

* [FIXED] - failure when a schema definition didn't have `properties` property

## 0.2.3

* [FIXED] - resolved `$ref`s values should be cloned so that original referenced schema object is not altered

## 0.2.2

* [FIXED] - `$ref` schema references should be resolved before the schema is sanitized to be Swagger compliant

## 0.2.1

* [FIXED] - `toSwagger` function should not alter state of original validator schema object (schema object should be cloned)

## 0.2.0

* [CHANGED] - renamed the package from `ajv2swagger` to `bi-ajv2swagger`

## 0.1.2

* [FIXED] - `toSwagger` function should get rid off the `allOf` schema structure if it's used only for data coercion in `Ajv`

## 0.1.1

* [ADDED] - dereference internal ajv schema references
* [ADDED] - dereference relative local paths - within an object (does not support external resources)

## 0.1.0

* [ADDED] - initial release
