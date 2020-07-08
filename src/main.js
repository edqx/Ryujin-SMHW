const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

const storage = require("electron-json-storage");

app.allowRendererProcessReuse = false;

app.on("ready", () => {
	var window = null;

	const menu = Menu.buildFromTemplate([{
		label: "File",
		submenu: []
	}, {
		label: "Window",
		submenu: [{
			label: "Reload",
			accelerator: "CmdOrCtrl+R",
			click: function () {
				window.reload();
			}
		}, {
			label: "Toggle Developer Tools",
			accelerator: "CmdOrCtrl+Shift+I",
			click: function () {
				window.webContents.toggleDevTools();
			}
		}, {
			label: "About",
			click: function () {
				const window = new BrowserWindow({
					width: 400,
					height: 600,
					resizable: false,
					webPreferences: {
						nodeIntegration: true
					},
					autoHideMenuBar: true,
					icon: path.resolve(__dirname, "../render/static/icon.png")
				});
			
				window.loadFile(path.resolve(__dirname, "../render/about.html"));
			}
		}]
	}, {
		label: "User",
		submenu: [{
			label: "Logout",
			click: function() {
				storage.remove("auth", function (err) {
					app.relaunch();
					app.exit(0);
				});
			}
		}]
	}]);

    storage.has("auth", function (err, has) {
		if (err) {
			app.quit();
			return console.log(err);
		}
		
		if (has) {
			Menu.setApplicationMenu(menu);

			window = new BrowserWindow({
				minWidth: 1280,
				minHeight: 720,
				webPreferences: {
					nodeIntegration: true
				},
				icon: path.resolve(__dirname, "../render/static/icon.png")
			});

			window.loadFile(path.resolve(__dirname, "../render/main.html"));
		} else {
			window = new BrowserWindow({
				width:  325,
                height: 375,
				webPreferences: {
					nodeIntegration: true
				},
				icon: path.resolve(__dirname, "../render/static/icon.png"),
				resizable: false,
				transparent: true,
				frame: false
			});

			window.loadFile(path.resolve(__dirname, "../render/login.html"));

			window.on("blur", function () {
				window.close();
			});
		}
	});
});
