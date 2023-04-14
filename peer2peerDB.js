let net = require("net");
let fs = require("fs");
//yargs to read cmd line and options
const yargs = require("yargs");
let serverIP = "127.0.0.1";
let singleton = require("./Singleton");
let server = require("./Server");
let ITPresponse = require("./ITPresponse");
const { exit } = require("process");
let rootList = [];
let peerDeclineTable = [];
let searchHistory = [];
let peerTable = [];
//get the arugment from cmd line
let argv = require("yargs/yargs")(process.argv.slice(2))
  .usage("Usage: $0 -p [str]")
  .default({ p: [] }).argv;
//get the executing path in an array
let path = process.cwd().split("\\");
//get the folder which is 1 less of the file [apoon43-Se3314B-assigment2],[peer1-2],[peer.js]
let folder = path[path.length - 1];
// get the root name assume the peer folder are name (peer_name)-(peerTableSize)
let rootName = folder.split("-")[0];
peerTableSize = folder.split("-")[1];
rootList.push(folder);

//console.log(argv,path,folder,rootName,peerTableSize);
//initiate singleton
singleton.init();
//create a peer server

let peerServer = net.createServer();
let imageServer = net.createServer();
// let fileServer = net.createServer();
//get a random port
let rootPort = getPort();
let imagePort = getPort();
// let filePort = getPort();
//let rootPort=3000;
//listen to local host and random port
peerServer.listen(rootPort, serverIP);
imageServer.listen(imagePort, serverIP);
// fileServer.listen(filePort, serverIP);
console.log(
  "ImageDB server is started at timestamp: " +
    singleton.getTimestamp() +
    " and is listening on " +
    serverIP +
    ":" +
    imagePort
);
console.log(
  "This peer address is  " +
    serverIP +
    ":" +
    rootPort +
    " located at " +
    rootName
);
//on incoming connection, let server handle it in handlejoin
peerServer.on("connection", function (sock) {
  server.handleJoin(
    sock,
    rootName,
    peerTableSize,
    peerServer,
    rootPort,
    singleton
  );
});
imageServer.on("connection", function (sock) {
  server.handleClientJoining(sock, imagePort, rootPort, rootName, singleton);
});
// fileServer.on("connection", function (sock) {
//   server.handleITP(sock);
// });
//console.log(argv.p);
//if there is a request ip/port
if (argv.p.length != 0) {
  let reqIP = argv.p.split(":")[0];
  reqPort = argv.p.split(":")[1];
  //create a client socket
  let clientSock = net.Socket({ readable: true, writable: true });
  //connect to requested port/IP, once connected, send the server address and port to the peer server
  clientSock.connect(reqPort, reqIP, function () {
    let msg =
      "000" + formatIPtoBin(serverIP) + formatBinary(rootPort.toString(2), 16);
    //console.log(msg);
    clientSock.write(msg);
  });
  //once server send ptp back, convert it, format it and decode it.
  clientSock.on("data", function (data) {
    data = data.toString("binary");
    data_decoder(data, clientSock);
  });
}
//auto rejoin process by first destroying the original sock and creating a new one.

//then go through all of the ip/port list to attempt establish connection
//if it connects, send the peer server ip and port
//then receive data from server, formate it and decode it as well.
function setConnection(ipList, portList, sock) {
  sock.destroy();

  let decline = false;
  //loop through the recieved peer table
  for (let i = 1; i < ipList.length; i++) {
    //loop through the peer decline table
    for (let j = 0; j < peerDeclineTable.length; j++) {
      if (ipList[i] == peerDeclineTable[j]) {
        j++;
        //if peer has declined before dont try to establish connection
        if (portList[i] == peerDeclineTable[j] || portList[i] == rootPort) {
          decline = true;
        }
      }
    }
    //if not decline
    if (!decline) {
      try {
        //make a new socket and attempt to connect
        //for some reason it can never establish a connection even though it is the right port and ip address
        let newsock = net.Socket({ readable: true, writable: true });
        console.log(`attempt to connect ${portList[i]}`);

        newsock.connect(portList[i], ipList[i], function () {
          //send this server listening port and ip
          console.log("connected");
          let msg =
            "000" +
            formatIPtoBin(serverIP) +
            formatBinary(rootPort.toString(2), 16);
          // console.log(msg);
          newsock.write(msg);
          console.log("wrote IP msg");
        });
        //receive data from server
        newsock.on("data", function (data) {
          console.log(data);
          data = data.toString("binary");
          // formatPacket(data);
          //if accepted decode or else just destroy the socket and attempt a different port
          if (data.slice(3, 11) == "00000001") {
            data_decoder(data, newsock);
          } else {
            newsock.destroy();
          }
        });
      } catch (err) {
        console.log(err);
      }
    }
  }
  //exit if no connection is made.
  console.log(
    "No valid Ip address are found from the peer table, app will now exit"
  );
  exit();
}

//display the ptp as format, for debugging purpose to ensure right byte are sent
function formatPacket(data) {
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
  console.log("PTP packet received: \n" + displayText);
}
//decode the data by slicing the ptp packet and saving it into indidviual variable
function data_decoder(data, sock) {
  let peerNameBin = "";
  let peerNumBin = "";
  let peerIp = "";
  let peerPort = "";
  let nameSize = "";
  let ipList = [];
  let portList = [];
  data = data.slice(3);
  let messageTypeBin = data.slice(0, 8);
  data = data.slice(8);
  peerNumBin = data.slice(0, 13);
  data = data.slice(13);
  nameSize = data.slice(0, 8);
  data = data.slice(8);

  peerNameBin = data.slice(0, parseInt(nameSize, 2) * 8);
  data = data.slice(parseInt(nameSize, 2) * 8);
  let ipString;
  let portString;
  let peerNum = parseInt(peerNumBin, 2);
  // console.log("peerNum"+peerNum,peerNumBin);
  //if the # of peer is 0,still grab the ip/port of that peer to put into this peer table
  if (peerNum == 0) {
    let tempIP = data.slice(0, 32);
    data = data.slice(32);
    let tempPort = data.slice(0, 16);
    data = data.slice(16);
    ipString = formatIP(tempIP);
    portString = formatPort(tempPort);
    //console.log(data);
    ipList.push(ipString);
    portList.push(portString);
  }
  //for non zero peer num, keep slicing ip/port address and save it in iplist and port list
  for (let i = 0; i < peerNum; i++) {
    let tempIP = data.slice(0, 32);
    data = data.slice(32);
    let tempPort = data.slice(0, 16);
    data = data.slice(16);
    ipString = formatIP(tempIP);
    portString = formatPort(tempPort);
    // console.log(data);
    ipList.push(ipString);
    portList.push(portString);
  }
  peerName = binaryToString(peerNameBin);

  // console.log("peerName:"+peerNameBin+"peerNum:"+peerNumBin+"size:"+nameSize+'IpString:'+ipString)
  //if the message type is 1, welcome, print the ip address
  console.log(peerName);
  if (parseInt(messageTypeBin, 2) == 1) {
    console.log(
      `Connected to peer ${peerName} at timestamp: ${singleton.getTimestamp()}`
    );
    console.log(
      `This peer address is ${serverIP}:${rootPort} located at ${rootName}`
    );
    peerTable.push(ipList[0], portList[0]);
  }
  console.log(
    `Recieved ack from ${binaryToString(peerNameBin)}: ${portList[0]}`
  );
  let table = "which is peered with";
  // console.log(portList);
  for (let i = 1; i < ipList.length; i++) {
    table += `[${ipList[i]}:${portList[i]}] , `;
  }
  console.log(table);
  //if peer table is full, initiate auto join
  if (parseInt(messageTypeBin, 2) == 2) {
    console.log(
      "The join has been declined; the auto-join process is performing ..."
    );
    peerDeclineTable.push(ipList[0], portList[0]);
    // console.log(ipList,portList);

    setConnection(ipList, portList, sock);
  }
}
//change the iP in binary to ipv4 format in string
function formatIP(IPbin) {
  // console.log("IPbin:"+IPbin);
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
//return port num from port bin
function formatPort(port) {
  return parseInt(port, 2);
}
//get a random port from 49152 above(ephermal port)
function getPort() {
  return Math.round(Math.random() * 16384) + 49152;
}
//convert binary of alphabet to string
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
//format binary format binary num based on required field size
function formatBinary(input, length) {
  while (input.length < length) {
    input = "0" + input;
  }
  return input;
}
//ipv4 to binary
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
