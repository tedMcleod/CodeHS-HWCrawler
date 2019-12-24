# CodeHS Crawler

This is a NodeJS tool using the Puppeteer headless browser to crawl CodeHS.com for student grades.

## Installation

Use the package manager [npm](https://www.npmjs.com/) to install CodeHS Crawler.

```bash
npm install code_hs_crawler
```

## Usage

```bash
npm start
```

## Troubleshooting
##### Problem names in output are not matching input names
Delete the ./cached directory as problem IDs may have changed

##### Why are there '--' in each of the output fields?
The assignment may have been removed and could not be found, no real solutions as of right now.

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.