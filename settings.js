const path = require('path');

module.exports = {
    /* General Settings */
    rebuildCache: false, // refresh assignment IDs?

    /* Output Settings */
    rmFormatChars: false, // remove strings like \t, \n, and \r in students' code?
    outDirectory: path.join(__dirname, 'out'), // __dirname refers to the path to this file
};