const argv = require('yargs')
  .usage('Usage: node index.js --inputDir <path> --outputDir <path> --verbose')
  .demand(['i', 'o'])
  .alias('i', 'inputDir')
  .describe('i', 'The directory path to source XML files from')
  .alias('o', 'outputDir')
  .describe('o', 'The directory path to merge XML files to')
  .alias('v', 'verbose')
  .describe('v', 'Whether to show verbose output')
  .help('h')
  .alias('h', 'help')
  .epilog('Copyright Charles Hulcher 2016')
  .argv;
const merge = require('lodash.mergewith');
const fs = require('fs-extra');
const path = require('path');
const pathExists = require('path-exists');
const through2 = require('through2');
const convert = require('xml-js');

// logs stuff
function log(...args) {
  if (argv.v) {
    console.log(...args);
  }
}

// gets the JS representation of an XML tree from a file
function getXMLasObj(filePath) {
  return new Promise((resolve, reject) => {
    pathExists(filePath).then(exists => {
      if (exists) {
        fs.readFile(filePath, (err, data) => {
          if (err) {
            reject(err);
          }
          else {
            resolve(JSON.parse(convert.xml2json(data, { compact: true })));
          }
        });
      }
      else {
        resolve({});
      }
    });
  });
}

// takes in array of files to merge XML contents
function processFiles(inputFiles = [], outputFiles = [], inputDir = '.', outputDir = './out') {
  return new Promise((resolve, reject) => {
    if (inputFiles.length) {
      const proms = inputFiles.map(file => {
        return new Promise((res, rej) => {
          log(`${outputFiles.indexOf(file) > -1 ? 'Merging' : 'Copying'} ${file}`);
          const inputFilePath = path.join(inputDir, file);
          const outputFilePath = path.join(outputDir, file);
          Promise.all([getXMLasObj(inputFilePath), getXMLasObj(outputFilePath)])
          .then(results => {
            const [
              inputObj,
              outputObj,
            ] = results;
            const mergedObj = merge({}, outputObj, inputObj, (dest, src, key) => {
              return key === '_comment' ? `${src}\n${dest || ''}` : undefined;
            });
            const xmlString = convert.json2xml(JSON.stringify(mergedObj), { compact: true, spaces: 2 });
            // if (outputFilePath.indexOf('values/dimens.xml') > -1) {
            // // console.log(JSON.stringify(mergedObj, null, 2));
            //   log(xmlString);
            //
            //   // console.log(JSON.stringify(inputObj, null, 2));
            // }
            // res();
            fs.outputFile(outputFilePath, xmlString, err => {
              if (err) {
                rej(err);
              }
              else {
                res();
              }
            });
          }, rej);
        });
      });
      Promise.all(proms).then(resolve, reject);
    }
    else {
      reject('No input files to process.');
    }
  });
}

function getXMLFilesInDir(dir) {
  return new Promise((resolve, reject) => {
    pathExists(dir).then(exists => {
      if (exists) {
        const items = [];
        const onlyXMLFilter = through2.obj(function filter(item, enc, next) { // no arrow!!
          if (item.path.indexOf('.xml') === item.path.length - 4) {
            this.push(item);
          }
          next();
        });
        fs.walk(dir)
          .pipe(onlyXMLFilter)
          .on('data', item => {
            items.push(item.path.slice(item.path.indexOf(dir) + dir.length));
          })
          .on('end', () => {
            resolve(items);
          });
      }
      else {
        reject(`Cannot find ${dir} from ${process.cwd()}`);
      }
    });
  });
}

function startMerge() {
  const {
    inputDir,
    outputDir,
  } = argv;
  if (inputDir && outputDir) {
    Promise.all([getXMLFilesInDir(inputDir), getXMLFilesInDir(outputDir)])
      .then((results) => {
        const [
          inputXmlFiles,
          outputXmlFiles,
        ] = results;
        processFiles(inputXmlFiles, outputXmlFiles, inputDir, outputDir)
          .then(() => {
            log('Operation complete.');
          }, log);
      }, log);
  }
}

function getAllFilesInDir(dir) {
  return new Promise((resolve, reject) => {
    pathExists(dir).then(exists => {
      if (exists) {
        const items = [];
        const noDirs = through2.obj(function filter(item, enc, next) { // no arrow!!
          if (!item.stats.isDirectory()) {
            this.push(item);
          }
          next();
        });
        fs.walk(dir)
          .pipe(noDirs)
          .on('data', item => {
            items.push(item.path.slice(item.path.indexOf(dir) + dir.length));
          })
          .on('end', () => {
            resolve(items);
          });
      }
      else {
        reject(`Cannot find ${dir} from ${process.cwd()}`);
      }
    });
  });
}

function list() {
  const {
    inputDir,
    outputDir,
  } = argv;
  if (inputDir && outputDir) {
    Promise.all([getAllFilesInDir(inputDir)]) // , getAllFilesInDir(outputDir)])
      .then((results) => {
        const [
          inputFiles,
          // outputFiles,
        ] = results;
        const proms = inputFiles.map(file => {
          return new Promise((resolve, reject) => {
            pathExists(path.join(outputDir, file)).then(exists => {
              if (!exists) {
                fs.copy(path.join(inputDir, file), path.join(outputDir, file), (err) => {
                  if (err) {
                    reject(err);
                  }
                  else {
                    console.log(`Copied ${file}`);
                    resolve();
                  }
                });
              }
              else {
                resolve();
              }
            });
          });
        });
        Promise.all(proms).then(() => {
          console.log('COmplete');
        }, (err) => {
          console.error(err);
        });
      });
  }
}
list();
