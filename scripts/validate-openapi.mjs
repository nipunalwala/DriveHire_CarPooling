import SwaggerParser from '@apidevtools/swagger-parser';

await SwaggerParser.validate('docs/api/openapi.json');
console.log('OpenAPI 3.0 contract validates, including schema references and operation structure.');
