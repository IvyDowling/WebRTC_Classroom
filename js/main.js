'use strict';

var owner = false;
var running = false;
var localStream;
var remoteStream;
var pc;
// thanks google
var pcConfig = {
    'iceServers': [{
        'url': 'stun:stun.l.google.com:19302'
    }]
};
// Set up audio and video regardless
var sdpConstraints = {
    'mandatory': {
        'OfferToReceiveAudio': true,
        'OfferToReceiveVideo': true
    }
};

var clientId = prompt("User ID", "");
console.log("USER ID: " + clientId);
var socket = io.connect();
// when the tab is closed, do the stop function
window.onbeforeunload = stop;
//set on click
if ($("#callbuttonId").length > 0) {
    $("#callbuttonId").click(function() {
        if ($("#callfieldId").length > 0) {
            var tocall = $("#callfieldId").val();
            if (tocall !== null && tocall !== "") {
                console.log("client attempting to join room: " + tocall);
                socket.emit('join', tocall);
                running = false;
                if (!running && typeof localStream !== 'undefined') {
                    createPeerConnection();
                    pc.addStream(localStream);
                    running = true;
                    if (owner) {
                        console.log('creating offer for peer');
                        pc.createOffer(setLocalAndsendSocketMessage,
                            function(event) {
                                console.log('createOffer() error: ', event);
                            },
                            sdpConstraints
                        );
                    }
                }
            }
        }
    });
}

if ($("#hangupbuttonId").length > 0) {
    $("#hangupbuttonId").click(hangup);
}

if (clientId !== '') {
    socket.emit('create', clientId);
    console.log('Attempted to create room: ', clientId);
}

//client
function sendSocketMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', message);
}

// socket receives
socket.on('created', function(room) {
    console.log('Created clientId ' + room);
    owner = true;
});

socket.on('full', function(room) {
    console.log('Room ' + room + ' is full');
});

socket.on('join', function(joined) {
    pc.createAnswer().then(
        setLocalAndsendSocketMessage,
        function(error) {
            console.log('Failed to create session description: ' + error.toString());
        },
        sdpConstraints
    );
});

socket.on('joined', function(room) {
    console.log('joined: ' + room);
});

socket.on('log', function(array) {
    console.log.apply(console, array);
});

socket.on('message', function(message) {
    console.log('Server says::', message);
    if (message === 'got user media') {
        if (!running && typeof localStream !== 'undefined') {
            createPeerConnection();
            pc.addStream(localStream);
            running = true;
            if (owner) {
                console.log('creating offer for peer');
                pc.createOffer(setLocalAndsendSocketMessage,
                    function(event) {
                        console.log('createOffer() error: ', event);
                    },
                    sdpConstraints
                );
            }
        }
    } else if (message.type.type === 'offer') {
        if (confirm("Call from " + message.origin)) {
            socket.emit('join', clientId);
            owner = false;
            if (typeof localStream !== 'undefined') {
                createPeerConnection();
                pc.addStream(localStream);
                running = true;
                if (owner) {
                    console.log('creating offer for peer');
                    pc.createOffer(setLocalAndsendSocketMessage,
                        function(event) {
                            console.log('createOffer() error: ', event);
                        },
                        sdpConstraints
                    );
                }
            }
            pc.setRemoteDescription(new RTCSessionDescription(message.type));
            console.log('Sending answer to peer.');
            pc.createAnswer().then(
                setLocalAndsendSocketMessage,
                function(error) {
                    console.log('Failed to create session description: ' + error.toString());
                },
                sdpConstraints
            );
        }
    } else if (message.type.type === 'answer' && running) {
        pc.setRemoteDescription(new RTCSessionDescription(message.type));
    } else if (message.type.type === 'candidate' && running) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.type.label,
            candidate: message.type.candidate
        });
        pc.addIceCandidate(candidate);
    } else if (message === 'bye' && running) {
        handleRemoteHangup();
    }
});

//GetUserMedia
//here is a good place to do browser checks for ie and safari (not supported)
navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
    })
    .then(function(stream) {
        $('#localVideo').attr("src", window.URL.createObjectURL(stream));
        localStream = stream;
        sendSocketMessage('got user media');
        if (owner && !running && typeof localStream !== 'undefined') {
            createPeerConnection();
            pc.addStream(localStream);
            running = true;
            if (owner) {
                console.log('creating offer for peer');
                pc.createOffer(setLocalAndsendSocketMessage,
                    function(event) {
                        console.log('createOffer() error: ', event);
                    },
                    sdpConstraints
                );
            }
        }
    }).catch(function(e) {
        alert('Error when getting video source: ' + e.name);
    });

//PEER CONNECTION
function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(null);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = function(event) {
            console.log('Remote stream removed. Event: ', event);
        };
        console.log('Created RTCPeerConnnection');
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
    }
}

function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
        sendSocketMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log('End of candidates.');
    }
}

function handleRemoteStreamAdded(event) {
    $('#remoteVideo').attr("src", window.URL.createObjectURL(event.stream));
    console.log('Remote stream added.');
    remoteStream = event.stream;
}

function setLocalAndsendSocketMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndsendSocketMessage sending message', sessionDescription);
    sendSocketMessage(sessionDescription);
}

function hangup() {
    console.log('Hanging up.');
    stop();
    sendSocketMessage('bye');
}

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
}

function stop() {
    running = false;
    owner = true;
    //if room host, will do nothing
    socket.emit("leave", clientId);
    if (pc !== null && pc !== undefined) {
        pc.close();
        pc = null;
    }
    //need to return null for window.onbeforeunload
    return null;
}
