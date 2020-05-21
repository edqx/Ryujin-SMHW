const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

app.on("ready", () => {
    const window = new BrowserWindow({
        minWidth: 1280,
        minHeight: 720,
        webPreferences: {
            nodeIntegration: true
        },
		icon: path.resolve(__dirname, "../render/static/icon.png")
    });
	
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
					app.quit();
				});
			}
		}]
	}]);

    Menu.setApplicationMenu(menu);

    window.loadFile(path.resolve(__dirname, "../render/main.html"));
});