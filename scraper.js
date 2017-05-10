"use strict"

const fs = require('fs');
const util = require('util');
const scrape = require('website-scraper');
const json2csv = require('json2csv');
const cheerio = require('cheerio');
const options = {
  urls: ["http://www.shirts4mike.com/shirts.php"],
  urlFilter: function(url){
    return url.indexOf('/shirt') > -1;
  },
  directory: './contents',
  sources: [
    {selector: 'a', attr: 'href'}
  ],
  onResourceError: (resource, error) => {
    if (error.syscall == "getaddrinfo") {
      throw `Error: ${error.code} \n\nThere was a problem retrieving your data.\n\nThis problem might be due to the website being down \nOr local connectivity problems, please check your internet first.\n`
    } else {
      throw `Error: ${error.code} \n\nOh oh! Something went wrong whilst trying to retrieve the requested data.\n`
    }
  },
  httpResponseHandler: (response) => {
    if (response.statusCode === 404) {
      return Promise.reject(new Error(`There was a 404 error: Page not found.`))
    } else {
      return Promise.resolve(response.body)
    }
  }
}

const EventEmitter = require('events');

//EventEmitter
class MyEmitter extends EventEmitter {}
const myEmitter = new MyEmitter();

let date = new Date();
let parseDate = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;

let log_file = fs.createWriteStream(__dirname + '/scraper-error.log', {flags : 'w'});
let log_stdout = process.stdout;

//Handling errors by writing them into the error.log
//When a console.error is called, this function is fired:
console.error = function(d) {
  //Updates the time variable
  date = new Date();
  //Prepends the timestamp to the error
  log_file.write(util.format(`[${date.toDateString()} ${date.toTimeString()}] `));
  //Write the error into the error.log
  log_file.write(util.format(d) + '\n');
  //Write the error in the console
  log_stdout.write(util.format(`\n${d} \n(You can check out a list of errors by opening the scraper-error.log)`) + '\n');
}

function createFolder(name) {
  if (!fs.existsSync(name)) {
    fs.mkdirSync(name);
  }
}

function deleteFolder(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach((file, index) => {
      let curPath = `${path}/${file}`;
      if(fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}

function dataExtract() {
  fs.unlink('./contents/index.html', () => {
    let json = {};
    let shirts = [];
    let amountShirts = fs.readdirSync(options.directory).length;
    fs.readdirSync(options.directory).forEach((file, index) => {
      fs.readFile(`${options.directory}/${file}`, "utf8", (err,data) => {
        let $ = cheerio.load(data);
        let price, title, imageUrl, url;
        let shirtInfo = { price : "", title : "", imageUrl : "", url : "", time: "" };

        price = $(".price").text();
        shirtInfo.price = price;

        title = $(".shirt-picture img").attr("alt");
        shirtInfo.title = title;

        imageUrl = $(".shirt-picture img").attr("src");
        shirtInfo.imageUrl = imageUrl;

        shirtInfo.url = `http://www.shirts4mike.com/shirt.php?id=${101+index}`;

        shirtInfo.time = parseDate;

        shirts.push(shirtInfo);

        if (shirts.length == amountShirts) {
          myEmitter.emit('completeJSON');
        }
      });
    });
  myEmitter.on('completeJSON', () =>   {
    json = {
      date : parseDate,
      shirtData : shirts
    };
    if (fs.existsSync(`output.json`)) {
      fs.unlinkSync(`output.json`)
    }
    fs.writeFile(`output.json`, JSON.stringify(json, null, 4), (error) => {
      if (error) { return console.error(error)};
      console.log(`\nThe relevant data has been extracted to the output.json file. \nYou can find it in the program's main folder.\n`);
      myEmitter.emit('printedData');
      });
    });
  });
}

//Function that turns JSON into CSV
function  csvConversion() {
  //When the json has been printed out to output.json
  myEmitter.on('printedData', () => {
    //Read the output.json file
    fs.readFile(`output.json`, (error, data) => {
      //Error handler
      if (error) { return console.error(error)};
      //Pass the shirtsData to a variable
      let shirts = JSON.parse(data.toString());
      //Set up the field and their display order according to the requests
      let fields = ['title', 'price', 'imageUrl', 'url', 'time'];
      //Turn json into csv with the proper module
      let csv = json2csv({ data: shirts.shirtData, fields: fields});
      //Create a .csv file with today's date as name
      fs.writeFile(`data/${shirts.date}.csv`, csv, (error) => {
        //Error handler
        if (error) { return console.error(error)};
        //CSV conversion success message
        console.log("The JSON file was successfully converted to CSV,\nyou can find the new file in the /data folder.");
        myEmitter.emit('completedCSV');
      });
    });
  });
}

fs.unlinkSync('scraper-error.log');
deleteFolder(options.directory);
createFolder("data");
scrape(options).then((result) => {
  if (result[0].children.length === 0) {
    throw `Sorry, but the program was not able to retrieve any data from the \nURL provided by the code. Please notify the developer whenever you can!`
  }
  dataExtract();
  csvConversion();
  myEmitter.on('completedCSV', ()=> {
    deleteFolder(options.directory);
  });
}).catch((error) => {
  console.error(error);
});
