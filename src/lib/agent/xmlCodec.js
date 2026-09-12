"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeXmlText = escapeXmlText;
exports.decodeXmlEntities = decodeXmlEntities;
var XML_ENTITIES = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
};
function escapeXmlText(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function decodeXmlEntities(value) {
    return value.replace(/&(?:amp|lt|gt|quot|apos);/g, function (entity) { return XML_ENTITIES[entity]; });
}
