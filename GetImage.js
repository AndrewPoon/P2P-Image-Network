let net = require("net");
let fs = require("fs");
let open = require("open");
let ITPpacket = require("./ITPRequest");
let singleton = require("./Singleton");
const { exit } = require("process");
//reading the arugment provided in the console
let argv = require("yargs/yargs")(process.argv.slice(2))
  .usage("Usage: $0 -s [str] -q [str,str] -v [num]")
  .default({ v: 7 }).argv;
// Client needs to manually input the ip address and port number of imageDb server
let address = argv.s.split(":")[0];
let port = argv.s.split(":")[1];

//contain the list of requested imgs
let imgList = [argv.q];
let receiveImgList = [];
for (let i = 0; i < argv._.length; i++) {
  imgList.push(argv._[i]);
}
let requestBin = "";
singleton.init();
// get the request packet represented in binary
requestBin = ITPpacket.getBitPacket(imgList);

// connect to server using address and port provided
let GetImage = new net.Socket({ readable: true, writable: true });
GetImage.setNoDelay(true);
GetImage.connect(port, address, function () {
  // send request for images
  GetImage.write(requestBin);
});

// listen for response
let lastPacket = false;
let header = true;
let response = "";
let IC = "";
let imageName = "";
GetImage.on("data", function (data) {
  // convert data to binary
  data = data.toString("binary");
  //verify secret string is intact
  if (data.slice(-16) == "1111111100000000") lastPacket = true;
  // store ITP response
  response += data;

  // for only the header
  if (header) {
    // display response header in binary form
    formatResponse(response);

    // dislay server response and what criteria the query met.
    IC = displayResponse(response);

    //remove the header from the data
    response = response.slice(64);
    header = false;
  }
  // start to complie all of image data when lastPacket
  if (lastPacket) {
    // loop through every images sent
    for (let i = 0; i < IC; i++) {
      let type = response.slice(0, 4);
      type = parseInt(type, 2);
      switch (type) {
        case 1:
          type = "BMP";
          break;
        case 2:
          type = "JPEG";
          break;
        case 3:
          type = "GIF";
          break;
        case 4:
          type = "PNG";
          break;
        case 5:
          type = "TIFF";
          break;
        case 15:
          type = "RAW";
          break;
      }
      //remove 4 bits from the start to make subsequent inquiries easier
      response = response.slice(4);
      //repeat similar steps for imageNamesize,imagesize, image name as image type
      let imageNameSize = response.slice(0, 12);
      imageNameSize = parseInt(imageNameSize, 2);
      response = response.slice(12);
      let imageSize = response.slice(0, 16);
      imageSize = parseInt(imageSize, 2);
      response = response.slice(16);
      imageName = response.slice(0, imageNameSize * 8);
      let arr = [];
      //each byte of imageName represent a letter, split imageName into byte size and look through each byte to reveal the ASCII character it stands for
      arr = imageName.match(/.{1,8}/g);
      imageName = "";
      for (let i = 0; i < arr.length; i++) {
        imageName += String.fromCharCode(parseInt(arr[i], 2).toString(10));
      }
      response = response.slice(imageNameSize * 8);

      // get the image as binary
      let image = response.slice(0, imageSize * 16);
      response = response.slice(imageSize * 16);
      //console.log(type, typeof type);
      // append image name with extension
      imageName = imageName + "." + type.toLowerCase();
      // convert the image data in binary to its original form using base 64 and storing it inside a buffer. use fs to write the file with data inside the buffer.
      if (imageSize > 0) {
        // save the image
        let img = binaryToString(image);
        let bufImage = new Buffer.from(img, "base64");
        fs.writeFileSync(imageName, bufImage);
        receiveImgList.push(imageName);
      }
    }
    console.log("");
    console.log("Disconnecting from the server...");
    GetImage.destroy();
    (async () => {
      // Opens the image in the default image viewer and waits for the opened app to finish.
      for (let i = 0; i < IC; i++) {
        await open(receiveImgList[i], { wait: true });
        if (i + 1 == IC) {
          exit();
        }
      }
    })(); // destroy client after server's response
  }
  // destroy client after server's response
});

GetImage.on("end", function () {
  console.log("");
  console.log("Connection closed");
  console.log("");
});
function binaryToString(input) {
  let bytesLeft = input;
  let result = "";
  // Check if we have some bytes left
  while (bytesLeft.length) {
    // Get the first digits
    const byte = bytesLeft.substr(0, 8);
    bytesLeft = bytesLeft.substr(8);

    result += String.fromCharCode(parseInt(byte, 2));
  }

  return result;
}
//formate and display the ITP server response(raw)
function formatResponse(data) {
  let displayText = "";
  for (let i = 0; i < 64; i++) {
    if (i != 0 && i % 8 == 0) {
      displayText += " ";
    }
    if (i != 0 && i % 32 == 0) {
      displayText += "\n";
    }
    displayText += data[i];
  }
  console.log("ITP packet header received: \n" + displayText);
}
//parse through the repsonse given the server and return the image count
function displayResponse(data) {
  let version = "";
  let fulfilled = "";
  let responseType = "";
  let IC = "";
  let sequenceNum = "";
  let timestamp = "";
  for (let i = 0; i < data.length; i++) {
    if (i < 3) {
      version += data[i];
    } else if (i < 4) {
      fulfilled += data[i];
    } else if (i < 12) {
      responseType += data[i];
    } else if (i < 17) {
      IC += data[i];
    } else if (i < 32) {
      sequenceNum += data[i];
    } else if (i < 64) {
      timestamp += data[i];
    }
  }
  //Parsing stuff
  version = parseInt(version, 2);
  fulfilled == 1 ? (fulfilled = "Yes") : (fulfilled = "No");
  repsonseType = parseInt(responseType, 2);
  IC = parseInt(IC, 2);
  sequenceNum = parseInt(sequenceNum, 2);
  timestamp = parseInt(timestamp, 2);

  switch (repsonseType) {
    case 1:
      responseType = "Found";
      break;
    case 2:
      responseType = "Not Found";
      break;
    case 3:
      responseType = "Busy";
      break;
  }
  //display result of query and return image count
  console.log(
    `--ITP version: ${version} \n--Fulfilled: ${fulfilled} \n--Response Type: ${responseType} \n--Image Count(s): ${IC} \n--Sequence Number: ${sequenceNum} \n--TimeStamp: ${timestamp}`
  );
  return IC;
}
