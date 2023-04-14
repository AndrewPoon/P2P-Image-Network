// You may need to add some delectation here
const singleton = require("./Singleton");
let fs = require("fs");
let files = fs.readdirSync("./");
//use file system to read all of the files inside the images dir

let fileNotFound = [];
module.exports = {
  //--------------------------
  //getpacket: returns the entire packet
  //--------------------------
  getPacket: function (request) {
    //Version will always be 7
    //IC is the imglist(request) length
    let version = 7;
    let IC = request.length;
    let responseType = 1;
    let fulfilled = false;
    let files = fs.readdirSync("./");
    //load all of files in ./images to serverImgs array
    let serverImgs = [];
    for (const file of files) {
      serverImgs.push(file);
    }
    for (let i = 0; i < request.length; i++) {
      //console.log(request[i]);
      //check if the img in imglist exist within the server
      //if it doesnt,set response type to not found
      if (!imageCheck(request[i], serverImgs)) {
        fileNotFound.push(request[i]);
        responseType = 2;
      }
    }
    //if request didn't fail request, return fulfilled
    if (responseType == 1) {
      fulfilled = true;
    }
    //assemble the first 32 bits of the ITP packet
    let responseHeader = header(version, fulfilled, IC, responseType);
    let packet = "";
    if (IC != 0) {
      //run thorugh each image and convert information about the image to binary
      for (let i = 0; i < request.length; i++) {
        let imageType;
        let fileNameSize;
        let imageFileName = "";
        let imageData;
        let imageSize;
        //split up image name and the type
        let imageFull = getImageNameAndType(request[i]);
        imageName = imageFull[0];
        imageType = imageFull[1];

        //get image type, image file name filename size image data and image size in binary using helper functions
        let imageTypeBin = imageTypeConverter(imageType);

        imageFileName = getImageName(imageName);
        fileNameSize = formatBinary((imageFileName.length / 8).toString(2), 12);

        imageData = getImgBin(request[i], serverImgs);
        if (imageData == undefined) {
          continue;
        } else {
          imageSize = getImageSize(imageData);
        }
        //add all image info in binary form to packet
        packet +=
          imageTypeBin + fileNameSize + imageSize + imageFileName + imageData;
      }
      //add header to packer
      packet = responseHeader + packet;
    }

    return packet;
  },
  //check if the images exist within this file directory.
  getFulfilled: function (request) {
    let serverImgs = [];
    fs.readdirSync("./");
    for (const file of files) {
      serverImgs.push(file);
    }

    for (let i = 0; i < request.length; i++) {
      //console.log(request[i]);
      //check if the img in imglist exist within the server
      //if it doesnt,set response type to not found
      //console.log(imageCheck(request[i], serverImgs));
      if (!imageCheck(request[i], serverImgs)) {
        fileNotFound.push(request[i]);
      }
    }
    if (fileNotFound.length > 0) {
      return false;
    } else return true;
  },
  //return the img still needed
  getSearchImg: function () {
    return fileNotFound;
  },
};
//return the requested images in binary
function getImgBin(input, serverImgs) {
  if (imageCheck(input, serverImgs)) {
    //  console.log(input);
    image = fs.readFileSync("./" + input.substring(0, input.length));
    return convertImgToBinary(image);
  }
}
//return image data size
function getImageSize(input) {
  let bin = (input.length / 16).toString(2);
  return formatBinary(bin, 16);
}
//convert image type into ITP Image type format
function imageTypeConverter(image) {
  let type;
  switch (image) {
    case "bmp":
      type = 1;
      break;
    case "jpeg":
      type = 2;
      break;
    case "gif":
      type = 3;
      break;
    case "png":
      type = 4;
      break;
    case "tiff":
      type = 5;
      break;
    case "raw":
      type = 15;
      break;
    default:
      type = 0;
  }
  type = type.toString(2);
  return formatBinary(type, 4);
}
// Extra utility methods can be added here

// One of the core function. return input in binary form based on length.
function formatBinary(input, length) {
  while (input.length < length) {
    input = "0" + input;
  }
  return input;
}

//convert image file to binary using base64 and return the binary representing the image data
function convertImgToBinary(input) {
  let result = "";
  input = input.toString("base64");
  for (let i = 0; i < input.length; i++) {
    let bin = input[i].charCodeAt().toString(2);
    result += Array(8 - bin.length + 1).join("0") + bin;
  }
  return result;
}

//check if the img name is equal to any of the ones in the server
function imageCheck(img, serverImgs) {
  // console.log(img, serverImgs);
  for (let i = 0; i < serverImgs.length; i++) {
    if (img.toLowerCase() == serverImgs[i].toLowerCase()) {
      return true;
    }
  }
  return false;
}
//create the ITP header needed based on client request information
function header(version, fulfilled, IC, responseType) {
  let bin = "";
  let sequenceNum = singleton.getSequenceNumber();
  let timestamp = singleton.getTimestamp();
  responseType = responseType.toString(2);
  bin += version.toString(2);
  fulfilled ? (bin += "1") : (bin += "0");
  bin += formatBinary(responseType, 8);
  bin += formatBinary(IC.toString(2), 5);
  bin += formatBinary(sequenceNum.toString(2), 15);
  bin += formatBinary(timestamp.toString(2), 32);
  return bin;
}
//return the image name and type as two seperate array
function getImageNameAndType(request) {
  request = request.split("\x00")[0].trim().toLowerCase().split(".");
  imageType = request[1];
  imageName = request[0];
  return [imageName, imageType];
}
// convert image name to binary
function getImageName(imageName) {
  let iN = imageName;
  iN = iN.split("\x00");
  let imageBin = "";
  for (let i = 0; i < imageName.length; i++) {
    var bin = imageName[i].charCodeAt().toString(2);
    imageBin += Array(8 - bin.length + 1).join("0") + bin;
  }
  return imageBin;
}
