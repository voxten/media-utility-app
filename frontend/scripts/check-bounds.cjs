const React = require('react');
const ReactDOMServer = require('react-dom/server');
const icons = require('@fluentui/react-icons');

function getSvg(component) {
  return ReactDOMServer.renderToStaticMarkup(React.createElement(component));
}

console.log('DocumentSync24Regular:', getSvg(icons.DocumentSync24Regular));
console.log('DocumentTextExtract24Regular:', getSvg(icons.DocumentTextExtract24Regular));
console.log('DocumentMultiple24Regular:', getSvg(icons.DocumentMultiple24Regular));
console.log('DocumentPdf24Regular:', getSvg(icons.DocumentPdf24Regular));
