const smhw = require("node-smhw");
const client = new smhw.Client;

var selected_school = null;

function start_loader() {
    document.querySelector(".loader").style.display = "block";
}

function end_loader() {
    document.querySelector(".loader").style.display = "none";
}

function update_school() {
    var elem = document.querySelector(".center-login-school");

    if (elem.value) {
        client.searchSchools(elem.value).then(function (schools) {
            if (schools.length) {
                var a = elem.value.length;

                elem.value += schools[0].name.substr(elem.value.length);
                elem.setSelectionRange(a, elem.value.length)

                selected_school = schools[0];
            } else {
                selected_school = null;
            }
        });
    }
}

function create_session() {
    const note = document.querySelector(".center-login-note");
    note.style.display = "none";

    var username = document.querySelector(".center-login-username").value;
    var password = document.querySelector(".center-login-password").value;

    document.querySelector(".center-login-container").style.display = "none";

    if (selected_school) {
        if (username) {
            if (password) {
                 start_loader();

                client.login(selected_school.id, username, password).then(function () {
                    end_loader();

                    storage.set("auth", client.access, function (err) {
                        if (err) {
                            note.className = "center-login-note center-login-error";
                            note.innerHTML = "An error occured, check console for details.";
                            note.style.display = "block";

                            return console.log(err);
                        }

                        start_dash();
                    });
                }).catch(function (e) {
                    end_loader();
                    document.querySelector(".center-login-container").style.display = "block";
                    note.className = "center-login-note center-login-error";
                    note.innerHTML = "Invalid credentials or school.";
                    note.style.display = "block";
                });
            } else {
                document.querySelector(".center-login-container").style.display = "block";
                note.className = "center-login-note center-login-error";
                note.innerHTML = "Invalid credentials.";
                note.style.display = "block";
            }
        } else {
            document.querySelector(".center-login-container").style.display = "block";
            note.className = "center-login-note center-login-error";
            note.innerHTML = "Invalid credentials.";
            note.style.display = "block";
        }
    } else {
        document.querySelector(".center-login-container").style.display = "block";
        note.className = "center-login-note center-login-error";
        note.innerHTML = "Invalid school.";
        note.style.display = "block";
    }
}

window.onload = function () {
    document.querySelector(".center-login-container").style.display = "block";
}

function start_dash() {
    var app = require("electron").remote.app;
    app.relaunch();
    app.exit(0);
}