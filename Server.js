let ptpPacket = require("./ptpPacket");
let ITPpacket = require("./ITPresponse");
let net = require("net");
let fs = require("fs");
let peerTable = [];
let occupied = false;
let completeImgList = false;

//circular queue
let circularBuffer = require("circular-buffer");

let searchHistory;
let requestImg = [];
let peerSenderPort;
let clientSock;
let peerSenderIP;
let imgStored = [];
module.exports = {
  //handleJoin is invoked when the peer server recieved a connection event
  handleJoin(sock, rootName, peerTableSize, peerServer, rootPort, singleton) {
    //get basic information to formate the ptp packet which include:rootIP,peerNum,peerNameBin

    let netInfo = false;
    let isITP = false;
    let peerTableFull = false;
    //if the other socket sends data, determine what type of data it is based on the first 3 chars
    try {
      sock.on("data", function (data) {
        data = data.toString("binary");
        //console.log(data);
        //If the data starts with 111, it is an ITP.
        if (data.slice(0, 3) == "111") {
          let seen = false;
          isITP = true;
          //define search history if it is undefined before
          if (searchHistory == undefined) {
            searchHistory = new circularBuffer(parseInt(peerTableSize));
          }
          //  formatPacket(data);

          //if it is a search packet
          if (parseInt(data.slice(3, 11), 2) == 3) {
            //convert circular buffer as array and loop through the array to determine if this data has been seen before
            let arr = searchHistory.toarray();
            for (let i = 0; i < arr.length; i++) {
              if (arr[i] == data);
              {
                seen = true;
              }
            }
            //push data to circular buffer
            searchHistory.push(data);
            //if this packet hasn't been seen before, invoke search Peer
            if (!seen) {
              searchPeer(data, sock);
            }
          }
        }
        //if data begins with 000, it is sending the root port and root ip.
        if (data.slice(0, 3) == "000") {
          data = data.slice(3);
          ip = data.slice(0, 32);
          data = data.slice(32);
          port = data.slice(0, 16);
          ip = formatIP(ip);
          port = formatPort(port);
          //console.log(peerTable);
          //determine if the peerTable is full and and print statements
          if (peerTable.length / 2 <= peerTableSize) {
            console.log(`Connected from peer ${ip}:${port}`);

            if (peerTable === undefined || peerTable.length == 0) {
              peerTable.push(ip, rootPort);
            }
          } else {
            console.log(`Peer Table full: ${ip}:${port} redirected`);
            peerTableFull = true;
          }
          netInfo = true;
        }
        //this means the ip and port of the search packet originate from.
        if (data.length == 48) {
          peerIPBin = data.slice(0, 32);
          data = data.slice(0, 32);
          peerPort = data.slice(0, 16);
          peerSenderPort = formatPort(peerPort);
          peerSenderIP = formatIP(peerIPBin);
        }
        //only invoke from peer attempting to join with this peer
        if (!isITP && netInfo) {
          let rootIP = sock.address().address;
          clientIP = sock.remoteAddress;
          clientPort = sock.remotePort;
          senderId = rootName;
          peerNum = peerTable.length / 2;
          peerNameBin = getPeerNameBin(senderId);

          //if the peerTable is not full, accept the incoming peer conncection , otherwise, send redirect packet
          if (!peerTableFull) {
            let message = ptpPacket.createMessage(
              "111",
              1,
              peerNum,
              peerNameBin.length / 8,
              peerNameBin,
              clientIP,
              clientPort,
              peerTable
            );
            //push peer IP and port to peer table
            peerTable.push(ip, port);
            sock.write(message);

            //console.log(senderId,clientIP,clientPort);
          }
          //if peerTable is full, send Msg type 2
          else {
            let message = ptpPacket.createMessage(
              "111",
              2,
              peerNum,
              peerNameBin.length / 8,
              peerNameBin,
              clientIP,
              clientPort,
              peerTable
            );
            // console.log(
            //   "Send decline message from " + rootPort + "with msg" + message
            // );
            sock.write(message);
          }
        }
      });
    } catch (err) {
      console.log(err);
    }
    //error handlding for socket.
    sock.on("end", function () {
      sock.destroy();
    });
    sock.on("close", function () {
      sock.destroy();
    });
    sock.on("error", function () {
      sock.destroy();
    });
  },
  // handle the image server connection
  handleClientJoining: async function (
    sock,
    imagePort,
    rootPort,
    rootName,
    singleton
  ) {
    let fulfilled;
    //identify client by timestamp

    let searchId = 0;
    // wait for client input
    let response = "";
    let header = true;
    let IC;
    let lastPacket = false;

    let client = "";
    if (!occupied) {
      sock.on("data", async function (data) {
        //deal with ITP request similar to assignment 1
        //change data into binary
        data = data.toString("binary");
        //ITP request
        if (data.slice(8, 24) == "0000000000000000") {
          //display client request
          let timestamp = singleton.getTimestamp();
          client = "Client-" + timestamp;
          console.log(`${client} is connected at timestamp: ${timestamp}\n`);
          occupied = true;
          displayRequest(data);
          console.log(`${client} requests:`);
          //get the list of requested img from client
          requestImg = client_decoder(data);
          // binResponse get the ITP repsonse packet and write it
          fulfilled = ITPpacket.getFulfilled(requestImg);
          let imgNotFound = [];
          clientSock = sock;
          //if imgs can't be found inside this file directory(peer not images)
          if (fulfilled == false) {
            //send search packet to look for said images in other peers
            imgNotFound = ITPpacket.getSearchImg();
            sendSearchPacket(
              imgNotFound,
              "127.0.0.1",
              rootName,
              imagePort,
              ++searchId,
              rootPort
            );
            occupied = false;
          }
        }
        //to signify the last packet since the image file is too big to be send in one packet.
        if (data.slice(-16) == "1111111100000000") lastPacket = true;
        if (data.length >= 1024) {
          //get the IC when display response
          response += data;
          if (header) {
            IC = displayResponse(response);
            header = false;
            response = response.slice(64);
          }
        }
        //if last packet, loops through IC and save each images in peer file directory.
        if (lastPacket) {
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
              imageName += String.fromCharCode(
                parseInt(arr[i], 2).toString(10)
              );
            }
            response = response.slice(imageNameSize * 8);

            // get the image as binary
            let image = response.slice(0, imageSize * 16);
            response = response.slice(imageSize * 16);
            //console.log(type, typeof type);
            // append image name with extension
            imageName = imageName + "." + type.toLowerCase();
            // console.log(`${imageName}`);
            // convert the image data in binary to its original form using base 64 and storing it inside a buffer. use fs to write the file with data inside the buffer.
            if (imageSize > 0) {
              // save the image
              let img = binaryToString(image);
              let bufImage = new Buffer.from(img, "base64");
              //console.log(bufImage);
              fs.writeFileSync(imageName, bufImage);
              //check if all of the request image is herer
              fulfilled = checkRequestImages(requestImg);
              imgStored.push(imageName);
            }
          }
        }
        // if all request images is received, send ITP response back to client
        if (fulfilled) {
          binResponse = ITPpacket.getPacket(imgStored);
          //console.log("bin response" + binResponse.slice(0, 100));
          clientSock.write(binResponse, 1024);
          clientSock.write("1111111100000000");
        }
      });

      //close socket connection
      sock.on("close", function () {
        console.log("");
        console.log(`${client} has closed the connection`);
        console.log("");
      });
      sock.on("error", function () {
        console.log("socket error");
      });
    }
  },
  //get the peer table
  getPeerTable: function () {
    return peerTable;
  },
};

//convert peername to binary
function getPeerNameBin(peerName) {
  let peerNameBin = "";
  for (let i = 0; i < peerName.length; i++) {
    var bin = peerName[i].charCodeAt().toString(2);
    peerNameBin += Array(8 - bin.length + 1).join("0") + bin;
  }
  return peerNameBin;
}
//format binary to a certain length
function formatBinary(input, length) {
  while (input.length < length) {
    input = "0" + input;
  }
  return input;
}
//change IP bin to ipv4 string
function formatIP(IPbin) {
  //console.log("IPbin:"+IPbin);
  let ip = "";
  let oct = "";
  for (let i = 0; i < 4; i++) {
    oct = IPbin.slice(0, 8);
    if (i != 3) {
      ip += parseInt(oct, 2) + ".";
    } else ip += parseInt(oct, 2);

    IPbin = IPbin.slice(8);
  }
  return ip;
}
//change port to num
function formatPort(port) {
  return parseInt(port, 2);
}
//display the ITP request
function displayRequest(data) {
  let displayText = "";
  for (let i = 0; i < data.length; i++) {
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
//decode the ITP request by client and return image count
function client_decoder(data) {
  let requestArr = [];
  let version = 7;
  //image count is extract here
  let imageCount = data.slice(3, 8).toString();
  let request_type = "Query";
  //remove the first 32 bits after the data is extracted
  data = data.slice(32);
  let requestImgType = "";
  let requestImg = "";
  let imageFileName = "";
  let fileNameSize = "";
  imageCount = parseInt(imageCount, 2);
  //loops through each image request.
  for (let i = 0; i < imageCount; i++) {
    //extract each image header and remove corresponding bits from data
    type = data.slice(0, 4);
    data = data.slice(4);
    fileNameSize = parseInt(data.slice(0, 12), 2);
    data = data.slice(12);
    imageFileName = data.slice(0, fileNameSize * 8);
    data = data.slice(fileNameSize * 8);
    //get the right type of image type of each image
    switch (parseInt(type, 2)) {
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
    requestImgType += type + ",";
    // get the file name using an array and match /.{1,8}/g meaning store each byte (8bits) from the binary file name into a element. Said element can be decoded using ASCII
    let request = "";

    let arr = imageFileName.match(/.{1,8}/g);

    for (let j = 1; j < arr.length; j++) {
      request += String.fromCharCode(parseInt(arr[j], 2).toString(10));
    }
    //console.log(request);
    imageFileName = request + " ";
    requestImg += imageFileName;
    //store the list of imgs with file extension in request Arr and return after loop through every image
    requestArr.push(request + "." + type.toLowerCase());
  }
  console.log(
    `--ITP version: ${version} \n` +
      `--Image Count ${imageCount} \n` +
      `--Request Type:${request_type} \n` +
      `--Image Type(s): ${requestImgType} \n` +
      `--Image File Name(s): ${requestImg}`
  );
  return requestArr;
}

//send search packet
function sendSearchPacket(arr, addr, rootName, imagePort, searchId, rootPort) {
  let sender = getPeerNameBin(rootName);
  let searchMessage = ptpPacket.createSearchMessage(
    "111",
    searchId,
    sender,
    sender.length / 8,
    addr,
    imagePort,
    arr
  );
  //console.log(peerTable, searchMessage);
  // console.log(peerTable, searchMessage);
  // go through the peerTable and send search packet to them.
  for (let i = 0; i < peerTable.length; i++) {
    let tempIP = peerTable[i];
    let tempPort = peerTable[++i];
    let searchSock = new net.Socket({ readable: true, writable: true });
    let netSock = new net.Socket({ readable: true, writable: true });
    //console.log(tempIP, tempPort);

    netSock.connect(tempPort, tempIP, function () {
      let msg = formatIPtoBin(addr) + formatBinary(rootPort.toString(2), 16);
      netSock.write(msg);
      // console.log(
      //   `sent peer server info from: IP: ${addr}: ${rootPort} with the data= \n ${msg}`
      // );
      netSock.destroy();
    });
    searchSock.connect(tempPort, tempIP, function () {
      searchSock.write(searchMessage);
      // console.log(
      //   `sent search packet to ${tempIP}: ${tempPort} with the data= \n ${searchMessage}`
      // );
      searchSock.destroy();
    });
  }
}
//change IP into binary format
function formatIPtoBin(addr) {
  let b = addr.split(".");
  bin = "";
  for (oct of b) {
    // console.log(typeof oct);
    bin += formatBinary(parseInt(oct).toString(2), 8);
    bin += "";
  }
  return bin;
}
//get the IC from ITP repsonse from other peers
function displayResponse(data) {
  // console.log(data);
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
  // console.log(
  //   `--ITP version: ${version} \n--Fulfilled: ${fulfilled} \n--Response Type: ${responseType} \n--Image Count(s): ${IC} \n--Sequence Number: ${sequenceNum} \n--TimeStamp: ${timestamp}`
  // );
  return IC;
}
//decipher the search packet
function searchPeer(data, sock) {
  let searchData = data;
  let ICBin = "";
  let searchIDBin = "";
  let Ip = "";
  let port = "";
  let nameSize = "";
  let ipList = [];
  let portList = [];
  let senderSizeBin = 0;
  data = data.slice(11);
  ICBin = data.slice(0, 5);
  data = data.slice(5);
  searchIDBin = data.slice(0, 8);
  data = data.slice(8);
  senderSizeBin = data.slice(0, 8);
  data = data.slice(8);
  // console.log(ICBin, searchIDBin, senderSizeBin);
  senderBin = data.slice(0, 8 * parseInt(senderSizeBin, 2));
  data = data.slice(8 * parseInt(senderSizeBin, 2));
  Ip = data.slice(0, 32);
  data = data.slice(32);
  port = data.slice(0, 16);
  data = data.slice(16);
  // console.log(Ip, port, senderBin, data);
  let IT = "";
  let fileNameSize = "";
  let fileName = "";
  let imgList = [];
  let imgNotFound = [];
  let imageCount = parseInt(ICBin, 2);
  //go through the seach packet and find what images is required
  for (let i = 0; i < imageCount; i++) {
    IT = data.slice(0, 4);
    data = data.slice(4);
    fileNameSize = data.slice(0, 12);
    data = data.slice(12);
    fileName = data.slice(0, 8 * parseInt(fileNameSize, 2));
    data = data.slice(8 * parseInt(fileNameSize, 2));
    //console.log(fileName, IT, fileNameSize);
    let image = getFileName(fileName, IT);
    //try to get the status of request, if it does not exist, push it to the not found list
    //else push it to the found list
    try {
      let filestatus = fs.statSync("./" + image);
      if (filestatus.isFile()) {
        imgList.push(image);
      } else {
        imgNotFound.push(image);
      }
    } catch (err) {
      imgNotFound.push(image);
    }
  }
  //send packets
  sendPackets(imgList, imgNotFound, Ip, port, sock, searchData);
}
function sendPackets(imgList, imgNotFound, IP, port, sock, searchPacket) {
  //find out what peer send the message packet
  let ITPresponse = "";
  let addr = "127.0.0.1";
  //if there is at least a image found, make a socket and return said image to originating image db server
  if (imgList.length > 0) {
    ITPresponse = ITPpacket.getPacket(imgList);
    port = parseInt(port, 2);
    IP = formatIP(IP);
    // console.log(imgList, imgNotFound, port, IP, peerTable);
    try {
      let returnSock = new net.Socket({ readable: true, writable: true });
      returnSock.connect(port, IP, function () {
        returnSock.write(ITPresponse, 1024);
        returnSock.write("1111111100000000");
        // console.log(`wrote ITP back to ${port}`);
      });
    } catch (err) {
      console.log(err);
    }
  }
  //if there is img no found, send search packet to this peer's peerTable's peers.
  if (imgNotFound.length > 0 && peerTable.length != 0) {
    for (let i = 0; i < peerTable.length; i++) {
      let tempIp = peerTable[i];
      let tempPort = peerTable[++i];
      //don't send to temp port if the search packet come from that port
      if (peerSenderPort == tempPort) {
        continue;
      } else {
        //make two socket to send search packet and this peer net info.
        try {
          let searchSock = new net.Socket({ readable: true, writable: true });
          let netSock = new net.Socket({ readable: true, writable: true });
          netSock.connect(tempPort, tempIp, function () {
            let msg =
              formatIPtoBin(addr) + formatBinary(rootPort.toString(2), 16);

            netSock.write(msg);
          });
          searchSock.connect(tempPort, tempIp, function () {
            searchSock.write(searchPacket);
          });
        } catch (err) {
          console.log(err);
        }
      }
    }
  }
}
//get the file name based on binary interpration.
function getFileName(fileName, IT) {
  let type = parseInt(IT, 2);
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
  //console.log(fileName, type);
  let arr = [];
  //each byte of imageName represent a letter, split imageName into byte size and look through each byte to reveal the ASCII character it stands for
  arr = fileName.match(/.{1,8}/g);
  imageName = "";
  for (let i = 0; i < arr.length; i++) {
    imageName += String.fromCharCode(parseInt(arr[i], 2).toString(10));
  }
  return imageName + "." + type.toLowerCase();
}
//change binary into a string.
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
//check if the file exist.
function checkRequestImages(request) {
  let files = fs.readdirSync("./");
  let status = true;
  let serverImgs = [];
  for (let file of files) {
    serverImgs.push(file);
  }
  for (let i = 0; i < request.length; i++) {
    //console.log(request[i]);
    //check if the img in imglist exist within the server
    //if it doesnt,set response type to not found
    try {
      fs.statSync("./" + request[i]);
    } catch (err) {
      status = false;
    }
  }
  return status;
}
