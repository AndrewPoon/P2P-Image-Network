module.exports = {
  //--------------------------
  //getBytePacket: returns the entire packet in bytes
  //--------------------------
  // not sure about the functionality of getByte when getBit can do the same thing and the format are usualy break down into byte anyway
  getBytePacket: function () {},

  //--------------------------
  //getBitPacket: returns the entire packet in bits format
  //--------------------------
  getBitPacket: function (input) {
    //create header (first 32 bits) packet
    let request = input;
    let IC = input.length;
    let packet = "";
    let version = 7;
    let header = createHeader(IC, version);

    for (let i = 0; i < request.length; i++) {
      // complie information regarding the images and store each indidviual one in its own packet
      let IT;
      let fileNameSize;
      let imageFileName;

      let imageType;
      let imageName;
      let imageFullName = getImageNameAndType(request[i]);
      imageName = imageFullName[0];
      imageType = imageFullName[1];
      // the the IT for this specific request
      IT = imageTypeConverter(imageType);
      // get the file name
      imageFileName = getImageName(imageName);
      // get the size of the file name
      fileNameSize = formatBinary((imageFileName.length / 8).toString(2), 12);
      // create the packet
      packet += createPacket(IT, fileNameSize, imageFileName);
    }
    packet = header + packet;
    return packet;
  },
};
//return the first 32 bit of request
function createHeader(IC, version) {
  return (
    formatBinary(version.toString(2), 3) +
    formatBinary(IC.toString(2), 5) +
    formatBinary("0", 24)
  );
}
//return image packet
function createPacket(IT, fileNameSize, imageFileName) {
  return (
    formatBinary(IT.toString(2), 4) +
    formatBinary(fileNameSize.toString(2), 2) +
    imageFileName
  );
}
//return name and type seperately
function getImageNameAndType(request) {
  request = request.split(".");
  imageType = request[1];
  imageName = request[0];
  return [imageName, imageType];
}

//convert image type to ITP 4 bit value
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
//get the Image Name in binary and round the byte
function getImageName(imageName) {
  let imageFileName = "";
  for (let i = 0; i < imageName.length; i++) {
    let bin = imageName[i].charCodeAt().toString(2);
    imageFileName += Array(8 - bin.length + 1).join("0") + bin;
  }

  return roundByte(imageFileName);
}
// One of the core function. return input in binary form based on length.
function formatBinary(input, length) {
  while (input.length < length) {
    input = "0" + input;
  }
  return input;
}
// round the image name bin to the nearest byte
function roundByte(input) {
  let addlength = input.length + (8 - (input.length % 8));
  input = formatBinary(input, addlength);
  return input;
}
