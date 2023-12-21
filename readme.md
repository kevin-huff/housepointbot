# Twitch Bot for House Management

## Description
This Twitch bot, built with Node.js and SQLite, allows Twitch stream moderators and authorized users to manage virtual "houses" (like groups or teams) within a chat. The streamer or mods can create, destroy houses, and manage points associated with these houses. The bot also integrates an overlay viewable through a web interface, (great for as Browser source in OBS) using Express and Socket.IO for real-time updates.

## Features
- **House Management:** Create and destroy houses.
- **Point System:** Add or remove points to houses.
- **User Management:** Users can join houses, and moderators can kick users from houses.
- **Real-time Leaderboard:** Display the houses and their points on a web interface.
- **Ticker Animation:** The leaderboard is displayed as a ticker that scrolls from right to left.
- **Notification of changes:** When any of the chatbot events fire a notification will be sent to the top left of the overlay.

## Prerequisites
- Node.js
- NPM
- Twitch account for the bot
- OAuth token for Twitch IRC
- SQLite Database (Automaticlly initilized)
## Installation & Configuration
### Local Server
1. Clone the repository:
   ```bash
   git clone https://github.com/kevin-huff/housepointbot
   ```
2. Install dependencies:
   ```bash
   cd housepointbot
   npm install
   ```
4. Update your configuraton:
    - Rename the .env.example to .env
    - Generate an oauth token from https://twitchapps.com/tmi/ for the bot account
    - Add in your twitch channel and bot account
3. Start the Server:
    ```bash
    npm start
    ```
    The bot automatically initializes the SQLite database if it does not exist. The database includes tables for houses, users, and points.
4. Add a Browser source for the overlay:
    - In obs create a new browser source
        - URL: ``http://localhost:3000/overlay``
        - Width: 1920
        - Height: 1080
        - No other changes
### Glitch.com
You can also remix the app on glitch.com:
1. Open the app on Glitch.com:
    ```bash 
    https://glitch.com/~house-point-bot
    ```
2. Click the ``Remix your own`` Button
3. Update your configuraton:
    - Rename the .env.example to .env
    - Generate an oauth token from https://twitchapps.com/tmi/ for the bot account
    - Add in your twitch channel and bot account
4. Add a Browser source for the overlay:
    - In obs create a new browser source
        - URL: ``http://[glitch-app-url]/overlay``
        - Width: 1920
        - Height: 1080
        - No other changes
## Chatbot commands
| Command           | Purpose                              | Example Usage                 |
|-------------------|--------------------------------------|-------------------------------|
| !create_house     | To create a new house                | !create_house Gryffindor      |
| !destroy_house    | To remove an existing house          | !destroy_house Gryffindor     |
| !add_points       | To add points to a house             | !add_points "Gryffindor" 50   |
| !remove_points    | To remove points from a house        | !remove_points "Gryffindor" 30|
| !join_house       | To join a user to a house            | !join_house Gryffindor        |
| !check_points     | To check the points of the user's house | !check_points              |
| !kick_from_house  | To remove a user from a house        | !kick_from_house Username123  |
| !list_houses      | To list all available houses         | !list_houses                  |
| !house_info       | To get information about a specific house | !house_info Gryffindor     |
| !user_info        | To get information about a specific user | !user_info Username123     |

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License
This project is licensed under the Unlicense