/**
 * @swagger
 * components:
 *   schemas:
 *     City:
 *       type: object
 *       required: [id, internalId, nome, fundada, capital, area, prefixo_telefonico, site_governo_provincial, municipios]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: 3da181d3-bee0-4aa0-ab10-d37c78b911f4
 *         internalId:
 *           type: integer
 *           description: ID numérico usado pelas relações da API (ex. cityId de uma equipa).
 *           example: 1
 *         nome:
 *           type: string
 *           example: Bengo
 *         fundada:
 *           type: string
 *           example: 26 de Abril de 1980
 *         capital:
 *           type: string
 *           example: Caxito
 *         area:
 *           type: string
 *           example: 31.371 km²
 *         prefixo_telefonico:
 *           type: string
 *           example: 034
 *         site_governo_provincial:
 *           type: string
 *           format: uri
 *           example: https://www.bengo.gov.ao
 *         municipios:
 *           type: string
 *           description: Lista de municípios serializada como JSON.
 *           example: '["Ambriz","Bula Atumba","Dande","Dembos","Nambuangongo","Pango Aluquém"]'
 *     CreateCityRequest:
 *       type: object
 *       required: [nome, fundada, capital, area, prefixo_telefonico, site_governo_provincial, municipios]
 *       description: O campo id é opcional; quando omitido, a API gera um UUID.
 *       properties:
 *         id: { type: string, format: uuid, example: 3da181d3-bee0-4aa0-ab10-d37c78b911f4 }
 *         nome: { type: string, example: Bengo }
 *         fundada: { type: string, example: 26 de Abril de 1980 }
 *         capital: { type: string, example: Caxito }
 *         area: { type: string, example: 31.371 km² }
 *         prefixo_telefonico: { type: string, example: '034' }
 *         site_governo_provincial: { type: string, format: uri, example: https://www.bengo.gov.ao }
 *         municipios:
 *           type: string
 *           description: Lista de municípios serializada como JSON.
 *           example: '["Ambriz","Bula Atumba","Dande","Dembos","Nambuangongo","Pango Aluquém"]'
 *     UpdateCityRequest:
 *       type: object
 *       minProperties: 1
 *       properties:
 *         nome: { type: string, example: Bengo }
 *         fundada: { type: string, example: 26 de Abril de 1980 }
 *         capital: { type: string, example: Caxito }
 *         area: { type: string, example: 31.371 km² }
 *         prefixo_telefonico: { type: string, example: '034' }
 *         site_governo_provincial: { type: string, format: uri, example: https://www.bengo.gov.ao }
 *         municipios:
 *           type: string
 *           example: '["Ambriz","Bula Atumba","Dande","Dembos","Nambuangongo","Pango Aluquém"]'
 *     CityList:
 *       type: array
 *       items:
 *         $ref: '#/components/schemas/City'
 */
