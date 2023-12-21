const sqlite3 = require('sqlite3').verbose()
const dbPath = './twitch_bot.db'
const tmi = require('tmi.js')
const dotenv = require('dotenv')
dotenv.config()
const express = require('express')
const socketIo = require('socket.io')
const http = require('http')
const path = require('path')
const app = express()
const port = 3000
const server = http.createServer(app)
const io = socketIo(server)

const dir = path.join(__dirname, 'public')
app.use(express.static(dir, {
  maxAge: '1d'
}))
app.use('/dist', express.static('dist'))
server.listen(port, () => {
  console.log('listening on *:3000')
})

io.on('connection', (socket) => {
  console.log('a user connected')
  socket.on('disconnect', () => {
    console.log('user disconnected')
  })
})

app.use(express.static('public'))
app.set('view engine', 'ejs')
app.get('/overlay', function (req, res) {
  // Fetch data from your database
  db.all(`SELECT houses.house_name, COUNT(users.user_id) as member_count, IFNULL(current_points.total_points, 0) as total_points
    FROM houses 
    LEFT JOIN users ON houses.house_id = users.house_id
    LEFT JOIN current_points ON houses.house_id = current_points.house_id
    GROUP BY houses.house_id`, [], (err, rows) => {
    if (err) {
      return console.error(err.message)
    }
    console.log('rows', rows)
    // Pass the data to the render function
    res.render('overlay.ejs', {
      leaderboard: rows
    })
  })
})

console.log('bot_account', process.env.bot_account)
const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: process.env.bot_account,
    password: process.env.oauth
  },
  channels: [process.env.twitch_channel]
})
client.connect()
client.on('message', async (channel, tags, message, self) => {
  console.log(`${tags.username}:`, message)
  const isBroadcaster = channel.slice(1) === tags.username
  const isMod = tags.mod || tags['user-type'] === 'mod' || isBroadcaster === true
  const authorizedUser = tags.username === 'zilchgnu' // Replace with your username
  if (message.toLowerCase().startsWith('!create_house')) {
    if (isBroadcaster || authorizedUser || isMod) {
      // Extract the house name from the message (it's everything after the !create_house text)
      const houseName = message.slice('!create_house '.length).trim()
      if (!houseName) {
        client.say(channel, `@${tags['display-name']}, please specify a house name.`)
        return
      }
      db.run('INSERT INTO houses (house_name) VALUES (?)', [houseName], function (err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            client.say(channel, `@${tags['display-name']}, the house '${houseName}' already exists.`)
          } else {
            console.error(err.message)
            client.say(channel, `@${tags['display-name']}, there was an error creating the house.`)
          }
        } else {
          client.say(channel, `@${tags['display-name']} has created the house '${houseName}'.`)
          updateLeaderboard()
          // Emit the notificaton
          io.emit('notification', `@${tags['display-name']} has created the house '${houseName}'.`)
        }
      })
    } else {
      client.say(channel, `@${tags['display-name']}, you do not have permission to create a house.`)
    }
  }
  if (message.toLowerCase().startsWith('!destroy_house')) {
    if (isBroadcaster || authorizedUser || isMod) {
      const houseName = message.slice('!destroy_house '.length).trim()

      if (!houseName) {
        client.say(channel, `@${tags['display-name']}, please specify a house name.`)
        return
      }

      db.run('DELETE FROM houses WHERE LOWER(house_name) = LOWER(?)', [houseName], function (err) {
        if (err) {
          console.error(err.message)
          client.say(channel, `@${tags['display-name']}, there was an error removing the house.`)
        } else if (this.changes === 0) {
          client.say(channel, `@${tags['display-name']}, the house '${houseName}' does not exist.`)
        } else {
          client.say(channel, `@${tags['display-name']} has removed the house '${houseName}'.`)
          updateLeaderboard()
          // emit the notificaton
          io.emit('notification', `@${tags['display-name']} has destroyed the house '${houseName}'.`)
        }
      })
    } else {
      client.say(channel, `@${tags['display-name']}, you do not have permission to destroy a house.`)
    }
  }
  if (message.toLowerCase().startsWith('!add_points')) {
    if (isBroadcaster || authorizedUser || isMod) {
      const match = message.match(/^!add_points\s+"([^"]+)"\s+(\d+)$/)

      if (!match) {
        client.say(channel, `@${tags['display-name']}, please use the format: !add_points "<house name>" <points>.`)
        return
      }

      const houseName = match[1]
      console.log('houseName', houseName)
      const pointsToAdd = parseInt(match[2], 10)

      db.get('SELECT house_id FROM houses WHERE LOWER(house_name) = LOWER(?)', [houseName], (err, row) => {
        if (err) {
          console.error(err.message)
          client.say(channel, `@${tags['display-name']}, there was an error finding the house.`)
        } else if (!row) {
          client.say(channel, `@${tags['display-name']}, the house '${houseName}' does not exist.`)
        } else {
          db.run('INSERT INTO points (house_id, points_change) VALUES (?, ?)', [row.house_id, pointsToAdd], (err) => {
            if (err) {
              console.error(err.message)
              client.say(channel, `@${tags['display-name']}, there was an error adding points.`)
            } else {
              client.say(channel, `@${tags['display-name']} has added ${pointsToAdd} points to the house '${houseName}'.`)
              updateLeaderboard()
              // emit the notificaton
              io.emit('notification', `@${tags['display-name']} has granted ${pointsToAdd} points to the house '${houseName}'.`)
            }
          })
        }
      })
    } else {
      client.say(channel, `@${tags['display-name']}, you do not have permission to add points.`)
    }
  }
  if (message.toLowerCase().startsWith('!remove_points')) {
    if (isBroadcaster || authorizedUser || isMod) {
      const match = message.match(/^!remove_points\s+"([^"]+)"\s+(-?\d+)$/)

      if (!match) {
        client.say(channel, `@${tags['display-name']}, please use the format: !remove_points "<house name>" <points>.`)
        return
      }

      const houseName = match[1]
      const pointsToRemove = parseInt(match[2], 10)

      db.get('SELECT house_id FROM houses WHERE LOWER(house_name) = LOWER(?)', [houseName], (err, row) => {
        if (err) {
          console.error(err.message)
          client.say(channel, `@${tags['display-name']}, there was an error finding the house.`)
        } else if (!row) {
          client.say(channel, `@${tags['display-name']}, the house '${houseName}' does not exist.`)
        } else {
          db.run('INSERT INTO points (house_id, points_change) VALUES (?, ?)', [row.house_id, -pointsToRemove], (err) => {
            if (err) {
              console.error(err.message)
              client.say(channel, `@${tags['display-name']}, there was an error removing points.`)
            } else {
              client.say(channel, `@${tags['display-name']} has removed ${pointsToRemove} points from the house '${houseName}'.`)
              updateLeaderboard()
              // emit the notificaton
              io.emit('notification', `@${tags['display-name']} has removed ${pointsToRemove} points from the house '${houseName}'.`)
            }
          })
        }
      })
    } else {
      client.say(channel, `@${tags['display-name']}, you do not have permission to remove points.`)
    }
  }
  if (message.toLowerCase().startsWith('!join_house')) {
    const houseName = message.substring('!join_house '.length).trim()

    if (!houseName) {
      client.say(channel, `@${tags['display-name']}, please specify a house name.`)
      return
    }

    const userId = tags['display-name']

    // Check if the user has already joined a house
    db.get('SELECT users.house_id, houses.house_name FROM users INNER JOIN houses ON users.house_id = houses.house_id WHERE user_id = ?', [userId], (err, row) => {
      if (err) {
        console.error(err.message)
        client.say(channel, `@${tags['display-name']}, there was an error processing your request.`)
      } else if (row) {
        client.say(channel, `@${tags['display-name']}, you have already joined the house '${row.house_name}'.`)
      } else {
        // Check if the specified house exists
        db.get('SELECT house_id FROM houses WHERE LOWER(house_name) = LOWER(?)', [houseName], (err, row) => {
          if (err) {
            console.error(err.message)
            client.say(channel, `@${tags['display-name']}, there was an error finding the house.`)
          } else if (!row) {
            client.say(channel, `@${tags['display-name']}, the house '${houseName}' does not exist.`)
          } else {
            // Add the user to the house
            db.run('INSERT INTO users (user_id, house_id) VALUES (?, ?)', [userId, row.house_id], (err) => {
              if (err) {
                console.error(err.message)
                client.say(channel, `@${tags['display-name']}, there was an error joining the house.`)
              } else {
                client.say(channel, `@${tags['display-name']} has joined the house '${houseName}'.`)
                updateLeaderboard()
                // emit the notificaton
                io.emit('notification', `@${tags['display-name']} has joined the house '${houseName}'.`)
              }
            })
          }
        })
      }
    })
  }
  if (message.toLowerCase() === '!check_points') {
    const userId = tags['display-name']

    // Query to find the user's house and its points
    const query = `
          SELECT h.house_name, COALESCE(SUM(p.points_change), 0) as total_points
          FROM users u
          LEFT JOIN houses h ON u.house_id = h.house_id
          LEFT JOIN points p ON h.house_id = p.house_id
          WHERE u.user_id = ?
          GROUP BY h.house_id
        `

    db.get(query, [userId], (err, row) => {
      if (err) {
        console.error(err.message)
        client.say(channel, `@${tags['display-name']}, there was an error processing your request.`)
      } else if (!row || !row.house_name) {
        client.say(channel, `@${tags['display-name']}, you have not joined a house yet.`)
      } else {
        client.say(channel, `@${tags['display-name']}, the house '${row.house_name}' has ${row.total_points} points.`)
      }
    })
  }
  if (message.toLowerCase().startsWith('!kick_from_house')) {
    const username = message.substring('!kick_from_house '.length).trim()

    if (!username) {
      client.say(channel, `@${tags['display-name']}, please specify a username.`)
      return
    }

    if (!isMod || !isBroadcaster || !authorizedUser) {
      client.say(channel, `@${tags['display-name']}, you don't have permission to use this command.`)
      return
    }

    db.get('SELECT user_id FROM users WHERE LOWER(user_id) = LOWER(?)', [username], (err, row) => {
      if (err) {
        console.error(err.message)
        client.say(channel, `@${tags['display-name']}, there was an error processing your request.`)
      } else if (!row) {
        client.say(channel, `@${tags['display-name']}, the user '${username}' is not part of a house.`)
      } else {
        db.run('DELETE FROM users WHERE LOWER(user_id) = LOWER(?)', [row.user_id], (err) => {
          if (err) {
            console.error(err.message)
            client.say(channel, `@${tags['display-name']}, there was an error kicking the user from the house.`)
          } else {
            client.say(channel, `@${tags['display-name']}, the user '${row.user_id}' has been kicked from their house.`)
            updateLeaderboard()
            // emit the notificaton
            io.emit('notification', `@${tags['display-name']} has kicked the user '${row.user_id}' from their house.`)
          }
        })
      }
    })
  }
  if (message.toLowerCase() === '!list_houses') {
    db.all('SELECT house_name FROM houses', [], (err, rows) => {
      if (err) {
        console.error(err.message)
        client.say(channel, `@${tags['display-name']}, there was an error processing your request.`)
      } else if (rows.length === 0) {
        client.say(channel, `@${tags['display-name']}, there are currently no houses to join.`)
      } else {
        const houseNames = rows.map(row => row.house_name).join(', ')
        client.say(channel, `@${tags['display-name']}, the available houses are: ${houseNames}.`)
      }
    })
  }
  if (message.toLowerCase().startsWith('!house_info')) {
    const houseName = message.substring('!house_info '.length).trim()

    if (!houseName) {
      client.say(channel, `@${tags['display-name']}, please specify a house name.`)
      return
    }

    db.get('SELECT house_id FROM houses WHERE LOWER(house_name) = LOWER(?)', [houseName], (err, row) => {
      if (err) {
        console.error(err.message)
        client.say(channel, `@${tags['display-name']}, there was an error processing your request.`)
      } else if (!row) {
        client.say(channel, `@${tags['display-name']}, the house '${houseName}' does not exist.`)
      } else {
        const houseId = row.house_id

        db.get('SELECT COUNT(*) as member_count FROM users WHERE house_id = ?', [houseId], (err, row) => {
          if (err) {
            console.error(err.message)
            client.say(channel, `@${tags['display-name']}, there was an error processing your request.`)
          } else {
            const memberCount = row.member_count

            db.get('SELECT SUM(points_change) as total_points FROM points WHERE house_id = ?', [houseId], (err, row) => {
              if (err) {
                console.error(err.message)
                client.say(channel, `@${tags['display-name']}, there was an error processing your request.`)
              } else {
                const totalPoints = row.total_points || 0
                client.say(channel, `@${tags['display-name']}, the house '${houseName}' has ${memberCount} members and ${totalPoints} points.`)
              }
            })
          }
        })
      }
    })
  }
  if (message.toLowerCase().startsWith('!user_info')) {
    const username = message.substring('!user_info '.length).trim()

    if (!username) {
      client.say(channel, `@${tags['display-name']}, please specify a username.`)
      return
    }

    db.get('SELECT house_id, joined_at FROM users WHERE LOWER(user_id) = LOWER(?)', [username], (err, row) => {
      if (err) {
        console.error(err.message)
        client.say(channel, `@${tags['display-name']}, there was an error processing your request.`)
      } else if (!row) {
        client.say(channel, `@${tags['display-name']}, the user '${username}' does not exist.`)
      } else {
        const houseId = row.house_id
        const joinedAt = row.joined_at

        db.get('SELECT house_name FROM houses WHERE house_id = ?', [houseId], (err, row) => {
          if (err) {
            console.error(err.message)
            client.say(channel, `@${tags['display-name']}, there was an error processing your request.`)
          } else {
            const houseName = row.house_name
            client.say(channel, `@${tags['display-name']}, the user '${username}' belongs to the house '${houseName}' and joined at '${joinedAt}'.`)
          }
        })
      }
    })
  }
})

async function updateLeaderboard () {
  db.all(`SELECT houses.house_name, COUNT(users.user_id) as member_count, IFNULL(current_points.total_points, 0) as total_points
            FROM houses 
            LEFT JOIN users ON houses.house_id = users.house_id
            LEFT JOIN current_points ON houses.house_id = current_points.house_id
            GROUP BY houses.house_id`, [], (err, rows) => {
    if (err) {
      return console.error(err.message)
    }
    io.emit('updateLeaderboard', rows)
    console.log('updateLeaderboard', rows)
  })
}

// Database Functions
function initializeDatabase () {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message)
      return
    }
    console.log('Connected to the SQLite database.')

    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS houses (
        house_id INTEGER PRIMARY KEY AUTOINCREMENT,
        house_name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`)

      db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        house_id INTEGER,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (house_id) REFERENCES houses(house_id)
      );`)

      db.run(`CREATE TABLE IF NOT EXISTS points (
        points_id INTEGER PRIMARY KEY AUTOINCREMENT,
        house_id INTEGER NOT NULL,
        points_change INTEGER NOT NULL,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (house_id) REFERENCES houses(house_id)
      );`)

      db.run(`CREATE VIEW IF NOT EXISTS current_points AS
        SELECT house_id, SUM(points_change) as total_points
        FROM points
        GROUP BY house_id;`)
    })

    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message)
      } else {
        console.log('Database initialization complete and connection closed.')
      }
    })
  })
}
// See if we need to initialize the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message)
    return
  }
  db.get('SELECT name FROM sqlite_master WHERE type="table" AND name="houses"', (err, row) => {
    if (err) {
      console.error('Error checking for table:', err.message)
      return
    }
    if (row === undefined) {
      initializeDatabase()
    } else {
      console.log('Database already initialized.')
    }
  })
})

function checkAndInitializeDatabase () {
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err && err.code === 'SQLITE_CANTOPEN') {
      console.log('Database not found. Initializing database...')
      initializeDatabase()
    } else if (err) {
      console.error('Error opening database:', err.message)
    } else {
      console.log('Database exists. Checking if tables are initialized...')
      checkTables(db)
    }
  })
}

function checkTables (db) {
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='houses'", (err, row) => {
    if (err) {
      console.error('Error checking tables:', err.message)
      db.close()
    } else if (!row) {
      console.log('Required tables not found. Initializing tables...')
      initializeDatabase()
    } else {
      console.log('All required tables found.')
      db.close()
    }
  })
}
// See if we need to initialize the database
checkAndInitializeDatabase()
