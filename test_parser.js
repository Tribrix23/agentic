var parseTextToolProtocol = require('./src/lib/agent/textToolProtocol').parseTextToolProtocol;
var fs = require('fs');
var text = "<think>\nTailwind v4 Play CDN confirmed: `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4`. Now write the landing page \u2014 single index.html, dark enterprise-grade design per v1-stop-slop.\n</think>\n\nTailwind v4 CDN confirmed. Now building the landing page. <tool_call>\n<function=writeFile>\n<parameter=path>index.html</parameter>\n<parameter=content><!doctype html>\n<html lang=\"en\" class=\"scroll-smooth\">\n<head>\n  <meta charset=\"UTF-8\" />\n</head>\n<body>\n</body>\n</html></parameter>\n</function>\n</tool_call>";
var known = new Set(['writeFile']);
var result = parseTextToolProtocol(text, known, 'permissive');
console.log(JSON.stringify(result, null, 2));
