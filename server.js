var fs = require('fs');
var dotenv = require('dotenv').config();
if (dotenv.error) {console.log("Could not find env file!\n\n");throw dotenv.error}

var serverOptions = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    port: process.env.PORT
};

var app = require('express')();
var https = require('https').createServer(serverOptions, app);
var io = require('socket.io')(https);
var request = require('request');

var rooms = {};
var api = {base: 'https://bevy.chat/'};

io.on('connection', function(socket){
    //Hold a map this socket is hosting / is a client of
    socket.peerMap = {};
    console.log("+ new socket connected");

    var addToRoom = function(roomid, user) {
        rooms[roomid].clients[socket.id] = socket;
        rooms[roomid].clients[socket.id].roomid = roomid;
        console.log("+++++ (" + (Object.keys(rooms[roomid].clients).length) + ") " + user.name + " joined room " + roomid);

        var numConnections = Object.keys(rooms[roomid].clients).length;
        socket.user = user;
        //Don't init the first connection since it has nowhere to go
        if(numConnections > 1) {
            socket.emit('inithosts', numConnections-1);
        }
    };

    var cleanUser = function(user) {
        return {name: user.name, verified: user.verified};
    };

    socket.on('sendtoclient', function(obj) {
        if(typeof socket.peerMap[obj.hostid] == 'undefined') {
            socket.peerMap[obj.hostid] = null;
        }

        //Add the user details to the response object
        obj.user = cleanUser(socket.user);

        var hostBound = false;

        //Announce to all the sockets to open a new client webrtc connection
        for(var clientId in rooms[socket.roomid].clients) {
            var clientSocket = rooms[socket.roomid].clients[clientId];
            //Skip the initiator socket
            if(clientSocket.id == socket.id || hostBound) {
                //console.log("SKIPPING SENDER SOCKET");
                continue;
            }

            //This socket is already bound to you, don't be greedy
            if(typeof rooms[socket.roomid].activePeerHosts[socket.id] != 'undefined'
                && typeof rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id] != 'undefined'
                && typeof rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id].hostid  != 'undefined'
                ) {
                //Send back to a specific client
                if(rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id].hostid == obj.hostid) {
                    console.log("+---> sending existing connection for host id " + obj.hostid);
                    socket.peerMap[obj.hostid] = clientSocket.id;
                    clientSocket.emit('initclient', obj);
                    break;
                } else {
                    //console.log("##TRIED TO SEND '" + obj.hostid + "' TO SOCKET " + clientSocket.id +
                    //" BUT ITS ALREADY BOUND TO '" + rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id].hostid + "'");
                    continue;
                }
            }

            //Init this socket activePeerHosts list
            if(typeof rooms[socket.roomid].activePeerHosts[socket.id] == 'undefined') {
                rooms[socket.roomid].activePeerHosts[socket.id] = {clients:{}};
            }

            //Init this socket clients reference
            if(typeof rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id] == 'undefined') {
                rooms[socket.roomid].activePeerHosts[socket.id].clients[clientSocket.id] = {hostid: obj.hostid};
                console.log("?---> picking a random client and sending connection to initclient for host id " + obj.hostid);
                socket.peerMap[obj.hostid] = clientSocket.id;
                clientSocket.emit('initclient', obj);
                hostBound=true;
            }

            if(!hostBound) {
                console.log("!!!!! No clients to bind this host to");
            }

        }

    });


    /**
     * Fires when a client has recieved the host connection
     * and is now sending it's own connection details to the host
     */
    socket.on('sendtohost', function(obj) {
        //Add the user details to the response object
        obj.user = cleanUser(socket.user);

        var responded = false;
        //Announce to all the sockets to open a new client webrtc connection
        for(var clientId in rooms[socket.roomid].clients) {
            var clientSocket = rooms[socket.roomid].clients[clientId];
            //Skip the initiator and any unready sockets
            if(clientSocket.id == socket.id) {
                continue;
            }

            if(typeof clientSocket.peerMap[obj.hostid] != 'undefined') {
                console.log("<---+ sending client " + obj.clientid + " to host " + obj.hostid);
                responded = true;
                clientSocket.emit('sendtohost', obj);
            }
        }

        if(!responded) {
            console.log("!---! COULDNT FIND HOST " + obj.hostid + " TO REPLY BACK TO " + obj.clientid);
        }

    });

    socket.on('initstreams', function() {
        console.log("///// sending stream re-init all clients in room " + socket.roomid);
        //Announce to all the sockets to open a new client webrtc connection
        for(var clientId in rooms[socket.roomid].clients) {
            var clientSocket = rooms[socket.roomid].clients[clientId];
            clientSocket.emit('initstreams');
        }
    });

    socket.on('join', function(obj){
        if(typeof obj.chatId == 'undefined') {
            return false;
        }
        var roomid = obj.chatId;
        var user = obj.user;

        //Init the room if it's new
        if(typeof rooms[roomid] == 'undefined') {
            rooms[roomid] = {id: roomid, clients:{}, activePeerHosts: {}};
        }

        if(user.token != null) {
            //Get the users details from their oAuth key. We don't trust the, to actually tell us their name / details
            request({
                url: api.base + 'api/1.0/users/whoami',
                headers: {
                    'Authorization': 'Bearer ' + user.token
                },
                rejectUnauthorized: false
            }, function(err, res) {
                if(err) {
                  return false;
                } else {

                    if(typeof res.body != 'undefined'
                        && typeof res.body === 'string'
                        && res.body != '') {
                        try {
                            user = JSON.parse(res.body);
                            user.data.verified = true;
                        } catch(e) {
                            console.log("Tried to read user data but recieved malformed JSON response");
                            return false;
                        }
                    } else {
                        console.log("Something went horribly wrong with the api auth");
                        return false;
                    }

                    addToRoom(roomid, user.data);
                }

          });
        } else {
            var username = "anonymous";

            //Take in the supplied username
            if(typeof obj.user != 'undefined' &&
                typeof obj.user.name != 'undefined') {
                username = obj.user.name;
            }

            //Send over an anon user
            addToRoom(roomid, {
                id: null,
                name: username,
                token: null,
                verified: false
            });
        }

    });

    socket.on('disconnect', function(){
        var roomid = socket.roomid;

        if(typeof rooms[roomid] != 'undefined' && typeof rooms[roomid].clients != 'undefined') {
            delete rooms[roomid].clients[socket.id];
            console.log("----- " + socket.user.name + ' disconnected from room ' + roomid);
        } else {
            console.log("!!!!! Room " + roomid + " clients dont exist");
        }


    });
});

https.listen(serverOptions.port, function(){
  console.log('listening on *:' + serverOptions.port);
});