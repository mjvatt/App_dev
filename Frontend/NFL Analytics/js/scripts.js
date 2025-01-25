 const sidebar = document.getElementById('sidebar');
const hamburger = document.getElementById('hamburger');
const mainContent = document.getElementById('main-content');
const sidebarLinks = document.querySelectorAll('.sidebar ul li a');

// Store original titles on initial load
sidebarLinks.forEach(link => {
	link.dataset.originalTitle = link.getAttribute('title'); // Store in data attribute
	link.removeAttribute('title'); // Remove title attribute initially
});


hamburger.addEventListener('click', () => {
	sidebar.classList.toggle('collapsed');
	mainContent.classList.toggle('collapsed');
	hamburger.classList.toggle('collapsed');

	// Toggle the tooltip only when collapsed
	if (sidebar.classList.contains('collapsed')) {
		sidebarLinks.forEach(link => {
			link.setAttribute('title', link.dataset.originalTitle); // Use stored title
		});
	} else {
		sidebarLinks.forEach(link => {
			link.removeAttribute('title'); // remove the title attribute
		});
	}
});

// Sample NFL Data (replace with actual data)
const nflData = {
	teams: [
		"Arizona Cardinals",
		"Atlanta Falcons",
		"Baltimore Ravens",
		"Buffalo Bills",
		"Carolina Panthers",
		"Chicago Bears",
		"Cincinnati Bengals",
		"Cleveland Browns",
		"Dallas Cowboys",
		"Denver Broncos",
		"Detroit Lions",
		"Green Bay Packers",
		"Houston Texans",
		"Indianapolis Colts",
		"Jacksonville Jaguars",
		"Kansas City Chiefs",
		"Los Angeles Chargers",
		"Los Angeles Rams",
		"Las Vegas Raiders",
		"Miami Dolphins",
		"Minnesota Vikings",
		"New England Patriots",
		"New Orleans Saints",
		"New York Giants",
		"New York Jets",
		"Philadelphia Eagles",
		"Pittsburgh Steelers",
		"San Francisco 49ers",
		"Seattle Seahawks",
		"Tampa Bay Buccaneers",
		"Tennessee Titans",
		"Washington Commanders"
	],
	wins: [10, 8, 12, 6, 9, 11, 7, 13, 11, 8, 12, 10, 6, 9, 7, 13, 10, 8, 12, 6, 9, 11, 7, 13, 10, 8, 12, 6, 9, 11, 7, 13],
	passingYards: [4500, 4200, 4800, 3900, 4100, 4600, 4000, 5000, 4300, 4000, 4700, 3800, 4200, 4900, 4100, 4600, 4000, 5000, 4500, 4200, 4800, 3900, 4100, 4600, 4000, 5000, 4300, 4000, 4700, 3800, 4200, 4900],
	rushingYards: [2000, 1800, 2200, 1500, 1900, 2100, 1700, 2300, 2200, 1600, 2000, 1900, 1400, 2000, 1800, 2300, 2000, 1800, 2200, 1500, 1900, 2100, 1700, 2300, 2200, 1600, 2000, 1900, 1400, 2000, 1800, 2300],
	touchdowns: [40, 35, 45, 30, 38, 42, 32, 48, 42, 35, 46, 30, 36, 44, 33, 48, 40, 35, 45, 30, 38, 42, 32, 48, 42, 35, 46, 30, 36, 44, 33, 48],
	points: [25, 22, 28, 19, 24, 26, 20, 30, 23, 21, 29, 18, 25, 27, 21, 29, 25, 22, 28, 19, 24, 26, 20, 30, 23, 21, 29, 18, 25, 27, 21, 29],
	salaryCap: {
		"Arizona Cardinals": 25000000,
		"Atlanta Falcons": 28000000,
		"Baltimore Ravens": 23000000,
		"Buffalo Bills": 29000000,
		"Carolina Panthers": 26000000,
		"Chicago Bears": 22000000,
		"Cincinnati Bengals": 27000000,
		"Cleveland Browns": 24000000,
		"Dallas Cowboys": 28000000,
		"Denver Broncos": 25000000,
		"Detroit Lions": 29000000,
		"Green Bay Packers": 26000000,
		"Houston Texans": 22000000,
		"Indianapolis Colts": 27000000,
		"Jacksonville Jaguars": 24000000,
		"Kansas City Chiefs": 28000000,
		"Los Angeles Chargers": 25000000,
		"Los Angeles Rams": 29000000,
		"Las Vegas Raiders": 26000000,
		"Miami Dolphins": 22000000,
		"Minnesota Vikings": 27000000,
		"New England Patriots": 24000000,
		"New Orleans Saints": 28000000,
		"New York Giants": 25000000,
		"New York Jets": 29000000,
		"Philadelphia Eagles": 26000000,
		"Pittsburgh Steelers": 22000000,
		"San Francisco 49ers": 27000000,
		"Seattle Seahawks": 24000000,
		"Tampa Bay Buccaneers": 27000000,
		"Tennessee Titans": 25000000,
		"Washington Commanders": 29000000
	},
	teamSpecific: {
		"Arizona Cardinals": {
			wins: 7,
			passingYards: 4000,
			rushingYards: 1800,
			touchdowns: 35,
			points: 20
		},
		"Atlanta Falcons": {
			wins: 8,
			passingYards: 4200,
			rushingYards: 1900,
			touchdowns: 38,
			points: 22
		},
		"Baltimore Ravens": {
			wins: 12,
			passingYards: 4800,
			rushingYards: 2200,
			touchdowns: 45,
			points: 28
		},
		"Buffalo Bills": {
			wins: 10,
			passingYards: 4100,
			rushingYards: 1600,
			touchdowns: 33,
			points: 26
		},
		"Carolina Panthers": {
			wins: 7,
			passingYards: 3900,
			rushingYards: 1700,
			touchdowns: 32,
			points: 18
		},
		"Chicago Bears": {
			wins: 11,
			passingYards: 4500,
			rushingYards: 2100,
			touchdowns: 42,
			points: 25
		},
		"Cincinnati Bengals": {
			wins: 9,
			passingYards: 4200,
			rushingYards: 2000,
			touchdowns: 35,
			points: 24
		},
		"Cleveland Browns": {
			wins: 13,
			passingYards: 4900,
			rushingYards: 2300,
			touchdowns: 48,
			points: 30
		},
		"Dallas Cowboys": {
			wins: 11,
			passingYards: 4700,
			rushingYards: 2200,
			touchdowns: 42,
			points: 28
		},
		"Denver Broncos": {
			wins: 8,
			passingYards: 4200,
			rushingYards: 1600,
			touchdowns: 36,
			points: 20
		},
		"Detroit Lions": {
			wins: 12,
			passingYards: 4600,
			rushingYards: 2100,
			touchdowns: 43,
			points: 29
		},
		"Green Bay Packers": {
			wins: 10,
			passingYards: 4100,
			rushingYards: 1900,
			touchdowns: 38,
			points: 26
		},
		"Houston Texans": {
			wins: 7,
			passingYards: 3800,
			rushingYards: 1500,
			touchdowns: 30,
			points: 18
		},
		"Indianapolis Colts": {
			wins: 9,
			passingYards: 4200,
			rushingYards: 2100,
			touchdowns: 37,
			points: 23
		},
		"Jacksonville Jaguars": {
			wins: 7,
			passingYards: 4000,
			rushingYards: 1600,
			touchdowns: 34,
			points: 22
		},
		"Kansas City Chiefs": {
			wins: 13,
			passingYards: 5000,
			rushingYards: 2300,
			touchdowns: 48,
			points: 30
		},
		"Los Angeles Chargers": {
			wins: 10,
			passingYards: 4600,
			rushingYards: 1900,
			touchdowns: 41,
			points: 26
		},
		"Los Angeles Rams": {
			wins: 8,
			passingYards: 4100,
			rushingYards: 2000,
			touchdowns: 37,
			points: 24
		},
		"Las Vegas Raiders": {
			wins: 12,
			passingYards: 4700,
			rushingYards: 2200,
			touchdowns: 44,
			points: 29
		},
		"Miami Dolphins": {
			wins: 6,
			passingYards: 3900,
			rushingYards: 1500,
			touchdowns: 32,
			points: 19
		},
		"Minnesota Vikings": {
			wins: 9,
			passingYards: 4300,
			rushingYards: 1900,
			touchdowns: 36,
			points: 24
		},
		"New England Patriots": {
			wins: 11,
			passingYards: 4500,
			rushingYards: 2100,
			touchdowns: 40,
			points: 27
		},
		"New Orleans Saints": {
			wins: 7,
			passingYards: 3800,
			rushingYards: 1600,
			touchdowns: 34,
			points: 21
		},
		"New York Giants": {
			wins: 13,
			passingYards: 5000,
			rushingYards: 2200,
			touchdowns: 48,
			points: 30
		},
		"New York Jets": {
			wins: 10,
			passingYards: 4400,
			rushingYards: 2100,
			touchdowns: 40,
			points: 26
		},
		"Philadelphia Eagles": {
			wins: 8,
			passingYards: 4100,
			rushingYards: 1800,
			touchdowns: 37,
			points: 22
		},
		"Pittsburgh Steelers": {
			wins: 12,
			passingYards: 4700,
			rushingYards: 2300,
			touchdowns: 45,
			points: 29
		},
		"San Francisco 49ers": {
			wins: 6,
			passingYards: 3900,
			rushingYards: 1600,
			touchdowns: 32,
			points: 19
		},
		"Seattle Seahawks": {
			wins: 9,
			passingYards: 4300,
			rushingYards: 1900,
			touchdowns: 39,
			points: 25
		},
		"Tampa Bay Buccaneers": {
			wins: 7,
			passingYards: 4000,
			rushingYards: 1700,
			touchdowns: 34,
			points: 22
		},
		"Tennessee Titans": {
			wins: 11,
			passingYards: 4600,
			rushingYards: 2000,
			touchdowns: 42,
			points: 28
		},
		"Washington Commanders": {
			wins: 13,
			passingYards: 4900,
			rushingYards: 2300,
			touchdowns: 48,
			points: 30
		}
	},
	players: {
		"Arizona Cardinals": [
			{ name: 'Player 1', salary: 5000000, capHit: 5000000 },
			{ name: 'Player 2', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 3', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 4', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 5', salary: 1500000, capHit: 1500000 },
		],
		"Atlanta Falcons": [
			{ name: 'Player 6', salary: 6000000, capHit: 6000000 },
			{ name: 'Player 7', salary: 4000000, capHit: 4000000 },
			{ name: 'Player 8', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 9', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 10', salary: 2000000, capHit: 2000000 }
		],
		"Baltimore Ravens": [
			{ name: 'Player 11', salary: 5500000, capHit: 5500000 },
			{ name: 'Player 12', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 13', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 14', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 15', salary: 1000000, capHit: 1000000 },
		],
		"Buffalo Bills": [
			{ name: 'Player 16', salary: 7000000, capHit: 7000000 },
			{ name: 'Player 17', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 18', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 19', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 20', salary: 3000000, capHit: 3000000 }
		],
		"Carolina Panthers": [
			{ name: 'Player 21', salary: 6000000, capHit: 6000000 },
			{ name: 'Player 22', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 23', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 24', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 25', salary: 1000000, capHit: 1000000 }
		],
		"Chicago Bears": [
			{ name: 'Player 26', salary: 4500000, capHit: 4500000 },
			{ name: 'Player 27', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 28', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 29', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 30', salary: 1500000, capHit: 1500000 }
		],
		"Cincinnati Bengals": [
			{ name: 'Player 31', salary: 5500000, capHit: 5500000 },
			{ name: 'Player 32', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 33', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 34', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 35', salary: 1000000, capHit: 1000000 }
		],
		"Cleveland Browns": [
			{ name: 'Player 36', salary: 4500000, capHit: 4500000 },
			{ name: 'Player 37', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 38', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 39', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 40', salary: 1500000, capHit: 1500000 }
		],
		"Dallas Cowboys": [
			{ name: 'Player 41', salary: 5000000, capHit: 5000000 },
			{ name: 'Player 42', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 43', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 44', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 45', salary: 1500000, capHit: 1500000 },
		],
		"Denver Broncos": [
			{ name: 'Player 46', salary: 6000000, capHit: 6000000 },
			{ name: 'Player 47', salary: 4000000, capHit: 4000000 },
			{ name: 'Player 48', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 49', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 50', salary: 2000000, capHit: 2000000 }
		],
		"Detroit Lions": [
			{ name: 'Player 51', salary: 5500000, capHit: 5500000 },
			{ name: 'Player 52', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 53', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 54', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 55', salary: 1000000, capHit: 1000000 },
		],
		"Green Bay Packers": [
			{ name: 'Player 56', salary: 7000000, capHit: 7000000 },
			{ name: 'Player 57', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 58', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 59', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 60', salary: 3000000, capHit: 3000000 }
		],
		"Houston Texans": [
			{ name: 'Player 61', salary: 6000000, capHit: 6000000 },
			{ name: 'Player 62', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 63', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 64', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 65', salary: 1000000, capHit: 1000000 }
		],
		"Indianapolis Colts": [
			{ name: 'Player 66', salary: 4500000, capHit: 4500000 },
			{ name: 'Player 67', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 68', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 69', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 70', salary: 1500000, capHit: 1500000 }
		],
		"Jacksonville Jaguars": [
			{ name: 'Player 71', salary: 5500000, capHit: 5500000 },
			{ name: 'Player 72', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 73', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 74', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 75', salary: 1000000, capHit: 1000000 }
		],
		"Kansas City Chiefs": [
			{ name: 'Player 76', salary: 4500000, capHit: 4500000 },
			{ name: 'Player 77', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 78', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 79', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 80', salary: 1500000, capHit: 1500000 }
		],
		"Los Angeles Chargers": [
			{ name: 'Player 81', salary: 5000000, capHit: 5000000 },
			{ name: 'Player 82', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 83', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 84', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 85', salary: 1500000, capHit: 1500000 },
		],
		"Los Angeles Rams": [
			{ name: 'Player 86', salary: 6000000, capHit: 6000000 },
			{ name: 'Player 87', salary: 4000000, capHit: 4000000 },
			{ name: 'Player 88', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 89', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 90', salary: 2000000, capHit: 2000000 }
		],
		"Las Vegas Raiders": [
			{ name: 'Player 91', salary: 5500000, capHit: 5500000 },
			{ name: 'Player 92', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 93', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 94', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 95', salary: 1000000, capHit: 1000000 },
		],
		"Miami Dolphins": [
			{ name: 'Player 96', salary: 7000000, capHit: 7000000 },
			{ name: 'Player 97', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 98', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 99', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 100', salary: 3000000, capHit: 3000000 }
		],
		"Minnesota Vikings": [
			{ name: 'Player 101', salary: 6000000, capHit: 6000000 },
			{ name: 'Player 102', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 103', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 104', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 105', salary: 1000000, capHit: 1000000 }
		],
		"New England Patriots": [
			{ name: 'Player 106', salary: 4500000, capHit: 4500000 },
			{ name: 'Player 107', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 108', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 109', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 110', salary: 1500000, capHit: 1500000 }
		],
		"New Orleans Saints": [
			{ name: 'Player 111', salary: 5500000, capHit: 5500000 },
			{ name: 'Player 112', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 113', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 114', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 115', salary: 1000000, capHit: 1000000 }
		],
		"New York Giants": [
			{ name: 'Player 116', salary: 4500000, capHit: 4500000 },
			{ name: 'Player 117', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 118', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 119', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 120', salary: 1500000, capHit: 1500000 }
		],
		"New York Jets": [
			{ name: 'Player 121', salary: 5000000, capHit: 5000000 },
			{ name: 'Player 122', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 123', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 124', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 125', salary: 1500000, capHit: 1500000 }
		],
		"Philadelphia Eagles": [
			{ name: 'Player 126', salary: 6000000, capHit: 6000000 },
			{ name: 'Player 127', salary: 4000000, capHit: 4000000 },
			{ name: 'Player 128', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 129', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 130', salary: 2000000, capHit: 2000000 }
		],
		"Pittsburgh Steelers": [
			{ name: 'Player 131', salary: 5500000, capHit: 5500000 },
			{ name: 'Player 132', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 133', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 134', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 135', salary: 1000000, capHit: 1000000 }
		],
		"San Francisco 49ers": [
			{ name: 'Player 136', salary: 7000000, capHit: 7000000 },
			{ name: 'Player 137', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 138', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 139', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 140', salary: 3000000, capHit: 3000000 }
		],
		"Seattle Seahawks": [
			{ name: 'Player 141', salary: 6000000, capHit: 6000000 },
			{ name: 'Player 142', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 143', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 144', salary: 1500000, capHit: 1500000 },
			{ name: 'Player 145', salary: 1000000, capHit: 1000000 }
		],
		"Tampa Bay Buccaneers": [
			{ name: 'Player 146', salary: 4500000, capHit: 4500000 },
			{ name: 'Player 147', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 148', salary: 2000000, capHit: 2000000 },
			{ name: 'Player 149', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 150', salary: 1500000, capHit: 1500000 }
		],
		"Tennessee Titans": [
			{ name: 'Player 151', salary: 5500000, capHit: 5500000 },
			{ name: 'Player 152', salary: 3500000, capHit: 3500000 },
			{ name: 'Player 153', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 154', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 155', salary: 1000000, capHit: 1000000 }
		],
		"Washington Commanders": [
			{ name: 'Player 156', salary: 4500000, capHit: 4500000 },
			{ name: 'Player 157', salary: 3000000, capHit: 3000000 },
			{ name: 'Player 158', salary: 2500000, capHit: 2500000 },
			{ name: 'Player 159', salary: 1000000, capHit: 1000000 },
			{ name: 'Player 160', salary: 1500000, capHit: 1500000 }
		]
	}
};

function updateSalaryCapList() {
    const salaryCapListElement = document.getElementById('salaryCapList');
    salaryCapListElement.innerHTML = '';

    // Convert the salaryCap object to an array of [team, cap] pairs
    const sortedTeams = Object.entries(nflData.salaryCap)
        .sort(([, capA], [, capB]) => capB - capA);

    sortedTeams.forEach(([team, cap], index) => {
        const rank = index + 1;
        // Add mock data for dead money. This is something that you will need to adjust to match your dataset.
        const deadMoney = Math.floor(Math.random() * (8000000 - 1000000 + 1)) + 1000000;
        const listItem = document.createElement('li');
        // Corrected path to use team name for the image name
        listItem.innerHTML = `<span>${rank}</span><img src="./images/${team.toLowerCase().replace(/ /g, '_')}.png" alt="${team} Logo"/><span>${team}</span><span style="text-align: right;">$${cap.toLocaleString()}</span><span style="text-align: right;">$${deadMoney.toLocaleString()}</span>`;
        salaryCapListElement.appendChild(listItem);
    });
}

function updatePlayerSalaryChart(selectedTeam) {
    const playerSalaryListElement = document.getElementById('playerSalaryList');
    playerSalaryListElement.innerHTML = '';

    const teamPlayers = nflData.players[selectedTeam];
    if (!teamPlayers) return;

    teamPlayers.forEach(player => {
        const listItem = document.createElement('li');
        // Corrected path to use the team name for the image name
        listItem.innerHTML = `<img src="./images/${selectedTeam.toLowerCase().replace(/ /g, '_')}.png" alt="${selectedTeam} Logo"/><span>${player.name}</span><span style="text-align: right;">Salary: $${player.salary.toLocaleString()}</span><span style="text-align: right;">Cap Hit: $${player.capHit.toLocaleString()}</span>`;
        playerSalaryListElement.appendChild(listItem);
    });
}

// Function to update the chart based on selected data
function updateChart(chart, xAxisDataKey, yAxisDataKey, selectedTeam) {
	if (xAxisDataKey === 'team') {
		chart.data.labels = [selectedTeam];
		chart.data.datasets[0].data = [nflData.teamSpecific[selectedTeam][yAxisDataKey]];
	} else {
		chart.data.labels = nflData[xAxisDataKey];
		chart.data.datasets[0].data = nflData[yAxisDataKey];
	}

	chart.update();
}

function updateTeamStatsDisplay(selectedTeam) {
    const teamData = nflData.teamSpecific[selectedTeam];
    if (!teamData) return;

    // Update Summary Cards on the Team Stats Page
    document.getElementById('teamTotalPassingYards').textContent = teamData.passingYards;
    document.getElementById('teamAvgPassingYards').textContent = (teamData.passingYards / nflData.teams.length).toFixed(0);
    document.getElementById('teamTotalRushingYards').textContent = teamData.rushingYards;
    document.getElementById('teamAvgRushingYards').textContent = (teamData.rushingYards / nflData.teams.length).toFixed(0);
    document.getElementById('teamTotalTouchdowns').textContent = teamData.touchdowns;
    document.getElementById('teamAvgTouchdowns').textContent = (teamData.touchdowns / nflData.teams.length).toFixed(0);
    document.getElementById('teamAvgPoints').textContent = teamData.points;
    document.getElementById('teamLeagueAvgPoints').textContent = (nflData.points.reduce((sum, points) => sum + points, 0) / nflData.points.length).toFixed(1);

	//Update Team Page Charts
    updateChart(teamWinsChartTeamPage, 'team', 'wins', selectedTeam);
    updateChart(playerPerformanceChartTeamPage, 'team', 'passingYards', selectedTeam);
}


// Get references to the dropdown menus and charts
const teamWinsXAxisSelect = document.getElementById('x-axis-select-teamWins');
const teamWinsYAxisSelect = document.getElementById('y-axis-select-teamWins');
const playerPerfXAxisSelect = document.getElementById('x-axis-select-playerPerf');
const playerPerfYAxisSelect = document.getElementById('y-axis-select-playerPerf');
const teamSelectSalaryChart = document.getElementById('team-select-salaryChart');
const teamSelectDropdown = document.getElementById('team-select');

const teamWinsXAxisSelectTeamPage = document.getElementById('x-axis-select-teamWins-teamPage');
const teamWinsYAxisSelectTeamPage = document.getElementById('y-axis-select-teamWins-teamPage');
const playerPerfXAxisSelectTeamPage = document.getElementById('x-axis-select-playerPerf-teamPage');
const playerPerfYAxisSelectTeamPage = document.getElementById('y-axis-select-playerPerf-teamPage');

const teamWinsChart = new Chart(document.getElementById('teamWinsChart'), {
    type: 'bar',
    data: {
        labels: nflData.teams,
        datasets: [{
            label: 'Team Wins',
            data: nflData.wins,
            backgroundColor: '#0ea5e9',
        }]
    },
    options: {
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    stepSize: 1
                },
                grid: {
                    color: '#374151'
                }
            },
            x: {
                grid: {
                    color: '#374151'
                }
            }
        },
        plugins: {
            legend: {
                display: false
            }
        }
    }
});

const teamWinsChartTeamPage = new Chart(document.getElementById('teamWinsChartTeamPage'), {
    type: 'bar',
    data: {
         datasets: [{
            label: 'Team Wins',
            backgroundColor: '#0ea5e9',
        }]
    },
    options: {
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    stepSize: 1
                },
                grid: {
                    color: '#374151'
                }
            },
            x: {
                grid: {
                    color: '#374151'
                }
            }
        },
        plugins: {
            legend: {
                display: false
            }
        }
    }
});

const playerPerformanceChart = new Chart(document.getElementById('playerPerformanceChart'), {
    type: 'line',
    data: {
        labels: nflData.teams,
        datasets: [{
            label: 'Total Passing Yards',
            data: nflData.passingYards,
            borderColor: '#eab308',
            backgroundColor: '#eab30880',
            borderWidth: 2,
            tension: 0.4
        }]
    },
    options: {
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: '#374151'
                }
            },
            x: {
                grid: {
                    color: '#374151'
                }
            }
        },
        plugins: {
            legend: {
                display: false
            }
        }
    }
});

const playerPerformanceChartTeamPage = new Chart(document.getElementById('playerPerformanceChartTeamPage'), {
    type: 'line',
    data: {
         datasets: [{
            label: 'Total Passing Yards',
            borderColor: '#eab308',
            backgroundColor: '#eab30880',
            borderWidth: 2,
            tension: 0.4
        }]
    },
    options: {
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: '#374151'
                }
            },
            x: {
                grid: {
                    color: '#374151'
                }
            }
        },
        plugins: {
            legend: {
                display: false
            }
        }
    }
});


// Add event listeners to the dropdown menus
teamWinsYAxisSelect.addEventListener('change', () => {
	const yAxisDataKey = teamWinsYAxisSelect.value;
	updateChart(teamWinsChart, "teams", yAxisDataKey);
});

playerPerfYAxisSelect.addEventListener('change', () => {
	const yAxisDataKey = playerPerfYAxisSelect.value;
	updateChart(playerPerformanceChart, "teams", yAxisDataKey);
});


teamWinsXAxisSelectTeamPage.addEventListener('change', () => {
    const xAxisDataKey = teamWinsXAxisSelectTeamPage.value;
    const yAxisDataKey = teamWinsYAxisSelectTeamPage.value;
    updateChart(teamWinsChartTeamPage, xAxisDataKey, yAxisDataKey);
});

teamWinsYAxisSelectTeamPage.addEventListener('change', () => {
    const xAxisDataKey = teamWinsXAxisSelectTeamPage.value;
    const yAxisDataKey = teamWinsYAxisSelectTeamPage.value;
    updateChart(teamWinsChartTeamPage, xAxisDataKey, yAxisDataKey);
});

playerPerfXAxisSelectTeamPage.addEventListener('change', () => {
    const xAxisDataKey = playerPerfXAxisSelectTeamPage.value;
    const yAxisDataKey = playerPerfYAxisSelectTeamPage.value;
    updateChart(playerPerformanceChartTeamPage, xAxisDataKey, yAxisDataKey);
});

playerPerfYAxisSelectTeamPage.addEventListener('change', () => {
    const xAxisDataKey = playerPerfXAxisSelectTeamPage.value;
    const yAxisDataKey = playerPerfYAxisSelectTeamPage.value;
    updateChart(playerPerformanceChartTeamPage, xAxisDataKey, yAxisDataKey);
});


teamSelectSalaryChart.addEventListener('change', () => {
    const selectedTeam = teamSelectSalaryChart.value;
    updatePlayerSalaryChart(selectedTeam);
});

teamSelectDropdown.addEventListener('change', () => {
    const selectedTeam = teamSelectDropdown.value;
    updateTeamStatsDisplay(selectedTeam);
});

// Calculate Averages
const avgPassingYards = nflData.passingYards.reduce((sum, yards) => sum + yards, 0) / nflData.passingYards.length;
const avgRushingYards = nflData.rushingYards.reduce((sum, yards) => sum + yards, 0) / nflData.rushingYards.length;
const avgTouchdowns = nflData.touchdowns.reduce((sum, td) => sum + td, 0) / nflData.touchdowns.length;
const avgPoints = nflData.points.reduce((sum, p) => sum + p, 0) / nflData.points.length;

// Update Summary Cards
document.getElementById('totalPassingYards').textContent = nflData.passingYards.reduce((sum, yards) => sum + yards, 0);
document.getElementById('avgPassingYards').textContent = avgPassingYards.toFixed(0);
document.getElementById('totalRushingYards').textContent = nflData.rushingYards.reduce((sum, yards) => sum + yards, 0);
document.getElementById('avgRushingYards').textContent = avgRushingYards.toFixed(0);
document.getElementById('totalTouchdowns').textContent = nflData.touchdowns.reduce((sum, td) => sum + td, 0);
document.getElementById('avgTouchdowns').textContent = avgTouchdowns.toFixed(0);
document.getElementById('avgPoints').textContent = avgPoints.toFixed(1);
document.getElementById('leagueAvgPoints').textContent = avgPoints.toFixed(1);

// Initial Population of Salary Cap List and Salary Chart
updateSalaryCapList();
updatePlayerSalaryChart('Arizona Cardinals');

// Populate team stats on page load. Default team is first team in the array.
updateTeamStatsDisplay('Arizona Cardinals');

// Get references to the page links and content sections
const pageLinks = document.querySelectorAll('.page-links a');
const summaryCards = document.getElementById('dashboardSummaryCards');
const charts = document.getElementById('dashboardCharts');
const widgetsArea = document.querySelector('.widgets-area');
const additionalCharts = document.getElementById('dashboardAdditionalCharts');
const teamStatsPage = document.getElementById('teamStatsPage');

// Function to hide all content sections
function hideAllContent() {
    summaryCards.style.display = 'none';
    charts.style.display = 'none';
    widgetsArea.style.display = 'none';
    additionalCharts.style.display = 'none';
    teamStatsPage.style.display = 'none';
}

// Function to show a specific content section
function showContent(content) {
    content.style.display = 'grid';
}

// Initialize the dashboard page to be the active tab and hide others
hideAllContent();
showContent(summaryCards);
showContent(charts);
showContent(widgetsArea);
showContent(additionalCharts);

// Add the active class to the first link, which is the Dashboard
pageLinks[0].classList.add('active');

// Add event listener for all page links
pageLinks.forEach(link => {
    link.addEventListener('click', function(event) {
        event.preventDefault(); // Prevent default link behavior

        // Remove active class from all links
        pageLinks.forEach(l => l.classList.remove('active'));

        // Add active class to the clicked link
        this.classList.add('active');

        // Hide all content sections initially
        hideAllContent();

        // Show content based on the clicked link
        const linkText = this.textContent;
        if (linkText === 'Dashboard') {
            showContent(summaryCards);
            showContent(charts);
            showContent(widgetsArea);
            showContent(additionalCharts);
        } else if (linkText === 'Team Stats') {
            showContent(teamStatsPage);
        } else if (linkText === 'Player Stats') {
            // Show content for Player Stats
            // Example:
            // const playerStatsContent = document.querySelector('.player-stats-content');
            // showContent(playerStatsContent);
        }
    });
});