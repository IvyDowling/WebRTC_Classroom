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
var socket = io.connect();
// when the tab is closed, do the stop function
window.onbeforeunload = stop;
//set on click
if ($("#callbuttonId").length > 0) {
    $("#callbuttonId").click(function() {
        if ($("#callfieldId").length > 0) {
            var tocall = $("#callfieldId").val();
            if (tocall !== null && tocall !== "") {
                socket.emit('join', tocall);
                running = false;
                if (!running && typeof localStream !== 'undefined') {
                    createPeerConnection();
                    pc.addStream(localStream);
                    running = true;
                    if (owner) {
                        pc.createOffer(setLocalAndsendSocketMessage,
                            function(error) {
                                console.log('Failed to create offer: ' + error.toString());
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
}

//client
function sendSocketMessage(message) {
    socket.emit('message', message);
}

// socket receives
socket.on('created', function(room) {
    owner = true;
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
    if (message === 'got user media') {
        if (!running && typeof localStream !== 'undefined') {
            createPeerConnection();
            pc.addStream(localStream);
            running = true;
            if (owner) {
                pc.createOffer(setLocalAndsendSocketMessage,
                    function(error) {
                        console.log('createOffer() error: ', error);
                    },
                    sdpConstraints
                );
            }
        }
    } else if (message.type.type === 'offer') {
        socket.emit('join', clientId);
        owner = false;
        if (typeof localStream !== 'undefined') {
            createPeerConnection();
            pc.addStream(localStream);
            running = true;
            if (owner) {
                pc.createOffer(setLocalAndsendSocketMessage,
                    function(error) {
                        console.log('createOffer() error: ', error);
                    },
                    sdpConstraints
                );
            }
        }
        pc.setRemoteDescription(new RTCSessionDescription(message.type));
        pc.createAnswer().then(
            setLocalAndsendSocketMessage,
            function(error) {
                console.log('Failed to create session description: ' + error.toString());
            },
            sdpConstraints
        );
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
                pc.createOffer(setLocalAndsendSocketMessage,
                    function(error) {
                        console.log('createOffer() error: ', error);
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
    } catch (error) {
        console.log('Failed to create PeerConnection, exception: ' + error.message);
        alert('Cannot create RTCPeerConnection object.');
    }
}

function handleIceCandidate(event) {
    if (event.candidate) {
        sendSocketMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    }
}

function handleRemoteStreamAdded(event) {
    $('#remoteVideo').attr("src", window.URL.createObjectURL(event.stream));
    remoteStream = event.stream;
}

function setLocalAndsendSocketMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    sendSocketMessage(sessionDescription);
}

function hangup()
    stop();
    sendSocketMessage('bye');
}

function handleRemoteHangup() {
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
