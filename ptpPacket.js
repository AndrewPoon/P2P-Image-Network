module.exports = {
  //construct the packet by converting most value to binary
  createMessage(
    V,
    messageType,
    peerNum,
    senderIDsize,
    senderID,
    peerIP,
    peerPort,
    peerTable
  ) {
    let packet = "";
    idSize = senderIDsize;
    messageType = formatBinary(messageType.toString(2), 8);
    peerNum = formatBinary(peerNum.toString(2), 13);
    senderIDsize = formatBinary(senderIDsize.toString(2), 8);
    rootIP = peerTable[0];
    rootPort = peerTable[1];
    packet +=
      V +
      messageType +
      peerNum +
      senderIDsize +
      senderID +
      formatIP(rootIP) +
      formatBinary(rootPort.toString(2), 16);
    //i =2 since 0,1 already have root ip/port
    for (let i = 2; i < peerTable.length; i++) {
      //check if it either a even(ip address)or odd(port num) and append said address to packet
      switch (i % 2) {
        case 0:
          peerIP = formatIP(peerTable[i]);
          packet += peerIP;
          break;
        case 1:
          peerPort = formatBinary(peerTable[i].toString(2), 16);
          packet += peerPort;
          break;
      }
    }

    //console.log(peerNum,senderIDsize,peerIP,peerPort);

    return packet;
  },
  //crete a cPTP search packet using the parameters
  createSearchMessage(
    V,
    searchId,
    sender,
    senderSize,
    addr,
    imagePort,
    imgList
  ) {
    let messageT = 3;
    let messageType = formatBinary(messageT.toString(2), 8);
    let IC = formatBinary(imgList.length.toString(2), 5);
    let IP = formatIP(addr);
    let port = formatBinary(imagePort.toString(2), 16);
    let imagePart = "";
    //loops through each request img and append corresponding information to search packet
    for (let i = 0; i < imgList.length; i++) {
      let IT = imgList[i].split(".")[1].toLowerCase();
      let imgName = imgList[i].split(".")[0];
      let nameBin = getImgNameBin(imgName);
      //console.log(imgList[i], nameBin, IT);
      let ITbin = imageTypeConverter(IT);
      imagePart +=
        ITbin + formatBinary((nameBin.length / 8).toString("2"), 12) + nameBin;
    }

    let packet =
      V +
      messageType +
      IC +
      formatBinary(searchId.toString(2), 8) +
      formatBinary(senderSize.toString(2), 8) +
      sender +
      IP +
      port +
      imagePart;
    //console.log(packet);
    return packet;
  },
};
//formate binary to certain length

function formatBinary(input, length) {
  while (input.length < length) {
    input = "0" + input;
  }
  return input;
}
//change ipv4 to binary
function formatIP(addr) {
  let b = addr.split(".");
  bin = "";
  for (oct of b) {
    //console.log(typeof(oct));
    bin += formatBinary(parseInt(oct).toString(2), 8);
    bin += "";
  }
  return bin;
}
//get the image name in binary
function getImgNameBin(imgName) {
  let imgNameBin = "";
  for (let i = 0; i < imgName.length; i++) {
    var bin = imgName[i].charCodeAt().toString(2);
    imgNameBin += Array(8 - bin.length + 1).join("0") + bin;
  }
  return imgNameBin;
}
//get the image type in binary
function imageTypeConverter(IT) {
  //console.log(IT);
  let type = 0;
  switch (IT) {
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
  }
  //console.log(type);
  type = type.toString(2);
  //console.log(type, formatBinary(type, 4));
  return formatBinary(type, 4);
}
