# CodeHS Crawler

This is a NodeJS tool using the Puppeteer headless browser to crawl CodeHS.com for student grades.

## Installation

#### Preferred Method
Clone this repository.
```bash
git clone https://github.com/e-zhang09/CodeHS-HWCrawler.git
```

#### Alternative(NPM Package) Method
Use the package manager [npm](https://www.npmjs.com/) to install CodeHS Crawler.

```bash
npm install code_hs_crawler
```

>Note: The npm package will be updated less frequently.
## Usage

```bash
npm start
```
>Note: For users using the npm package method, 'cd' into INSTALL_DIRECTORY/node_modules/code_hs_crawler directory before npm start

## Troubleshooting
##### Problem names in output are not matching input names
Delete the ./cached directory as problem IDs may have changed

##### Why are there '--' in each of the output fields?
The assignment may have been removed and could not be found, no real solutions as of right now.

##### ERROR: The process with PID \# (child process of PID \#) could not be terminated.
Could be ignored, may cause excessive memory usage?

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.