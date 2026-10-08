# Secret Hitler - Firebase API

This project is the backend for the Secret Hitler game, intended to be deployed to Firebase Functions. It is designed to
work with the frontend implemented using SvelteKit, deployed to Firebase Hosting.

Secret Hitler Svelte : https://github.com/touficbatache/SecretHitlerSvelte

## Flow sheet

![flowsheet](/images/flowsheet.png)

## How to install?

```shell
git clone https://github.com/touficbatache/SecretHitlerFirebase.git
cd SecretHitlerFirebase
npm install
```

This API is supposed to be deployed to a Firebase project.

I - First, you will need to install the Firebase CLI using the following command:

```shell
npm install -g firebase-tools
```

**Note:** The `-g` flag installs a package (here Firebase CLI) globally, which allows you
to call it from any command line on your local computer.

II - Then, you'll have to create a Firebase project with the following features turned on:

- Authentication
- Functions
- Realtime Database

and login:

```shell
firebase login
```

III - Link the project you just created by running the following command:

```shell
npm run link --project=[PROJECTNAME]
```

## Run in dev mode

Inside to the `functions/` directory, make sure to set the correct environment variable values for development
in `.env`.

Then execute the following command, which listens to code changes when building and runs the Firebase Emulator locally:

```shell
npm run serve
```

The Emulator UI can be accessed using the URL shown in the terminal, usually http://localhost:4002/.

`DEV=true` turns on dev mode: authentication and role checks are skipped and fake player ids are generated, so one
client can simulate a whole game. It only works inside the emulator. Deployed functions ignore it, so a `DEV=true`
copied into `.env.[PROJECTNAME]` by `npm run link` can't disable authentication in production.

## Tests

The tests play games through the API against the Firebase emulators (functions and database), in
dev mode. They cover the game rules, concurrent requests, phase timing, lobbies and the database
security rules. From `functions/`:

```shell
npm test
```

This builds the functions, starts the emulators on the `demo-shtest` project (`DEV=true` comes from
`functions/.env.demo-shtest`), runs every file in `functions/test/` and stops the emulators. A
`functions/.env.local` file also applies to the emulator: make sure it doesn't set `DEV=false`.

## Deploy to production

Inside to the `functions/` directory, make sure to set the correct environment variable values for production
in `.env.[PROJECTNAME]`, then deploy:

```shell
cd functions/
npm run deploy
```

## API description

http://127.0.0.1:5001/[project-id]/us-central1/api/[route]/

### ==== Create a new game ====

**Request:**

`POST /newGame/`

```
NO BODY
```

**Response:**

```http request
HTTP/1.1 201 Created
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== Join a game ====

**Request:**

`POST /joinGame/`

```json
{
  "code": "[GAMECODE]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== Game owner: start the game ====

*⚠️ GAME OWNER ONLY ⚠️*

**Request:**

`POST /startGame/`

```json
{
  "code": "[GAMECODE]",
  "hidePicsGameInfo": "[BOOLEAN]",
  "skipLongIntro": "[BOOLEAN]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== President: choose a chancellor ====

*⚠️ PRESIDENT ONLY ⚠️*

**Request:**

`POST /chooseChancellor/`

```json
{
  "code": "[GAMECODE]",
  "chancellorId": "[PLAYER_ID]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== Vote: cast a ballot ====

**Request:**

`POST /vote/`

```json
{
  "code": "[GAMECODE]",
  "vote": "[BOOLEAN]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== President: discard a policy ====

*⚠️ PRESIDENT ONLY ⚠️*

**Request:**

`POST /presidentDiscardPolicy/`

```json
{
  "code": "[GAMECODE]",
  "policy": "[POLICY]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== Chancellor: discard a policy ====

*⚠️ CHANCELLOR ONLY ⚠️*

**Request:**

`POST /chancellorDiscardPolicy/`

```json
{
  "code": "[GAMECODE]",
  "policy": "[POLICY]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== Presidential Power: Policy Peek ====

*⚠️ PRESIDENT ONLY ⚠️*

**Request:**

`POST /presidentialPower/`

```json
{
  "code": "[GAMECODE]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{
    "code": "[GAMECODE]",
    "policies": "[POLICY],[POLICY],[POLICY]"
}
```

*❗ Call again to continue game progress ❗*

### ==== Presidential Power: Investigation ====

*⚠️ PRESIDENT ONLY ⚠️*

**Request:**

```json
{
  "code": "[GAMECODE]",
  "player": "[PLAYER_ID]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

*❗ Call again to continue game progress ❗*

### ==== Presidential Power: Special Election ====

*⚠️ PRESIDENT ONLY ⚠️*

**Request:**

```json
{
  "code": "[GAMECODE]",
  "player": "[PLAYER_ID]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== Presidential Power: Execution ====

*⚠️ PRESIDENT ONLY ⚠️*

**Request:**

```json
{
  "code": "[GAMECODE]",
  "player": "[PLAYER_ID]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== Chancellor: ask for a veto ====

*⚠️ CHANCELLOR ONLY ⚠️*

**Request:**

`POST /askForVeto/`

```json
{
  "code": "[GAMECODE]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== President: answer the veto ====

*⚠️ PRESIDENT ONLY ⚠️*

**Request:**

`POST /answerVeto/`

```json
{
  "code": "[GAMECODE]",
  "refuseVeto": "[BOOLEAN]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]" }
```

### ==== Move on after a pause ====

The game pauses between some phases: the intro (5s, or 30s for the long intro), and 5s to show the
votes, an enacted policy or a power's result. The server doesn't wait during a pause: it writes the
next step in the game's `pendingTransition` node, as `{ "at": [SERVER TIME IN MS], "kind": "..." }`.

Clients show the pause until `at` (on the server's clock, with `.info/serverTimeOffset`), then call
this endpoint to apply it. Any request on the game also applies it once it's due. Actions sent
during a pause get a 457.

**Request:**

`POST /advance/`

```json
{
  "code": "[GAMECODE]"
}
```

**Response:**

```http request
HTTP/1.1 200 OK
content-type: application/json

{ "code": "[GAMECODE]", "pendingTransitionAt": "[SERVER TIME IN MS, IF A PAUSE IS STILL ON]" }
```

### ==== GAME END ====

Game will end automatically and a team will win depending on one of these conditions:

**Liberal team:**

- 5 liberal policies have been enacted, or
- Hitler is executed

**Fascist team:**

- 6 fascist policies have been enacted, or
- Hitler is elected Chancellor after 3 or more fascist policies are enacted

### Error responses

#### Unauthorized

```http request
HTTP/1.1 401 Unauthorized
content-type: application/json

{ "message": "401 - Unauthorized" }
```

#### Forbidden

```http request
HTTP/1.1 403 Forbidden
content-type: application/json

{ "message": "403 - Forbidden" }
```

#### Game is busy

Requests on the same game run one at a time. A request that waits more than 15 seconds for its turn gets:

```http request
HTTP/1.1 409 Conflict
content-type: application/json

{ "message": "409 - Game is busy, try again" }
```

#### Missing fields

```http request
HTTP/1.1 422 Missing fields
content-type: application/json

{ "message": "422 - Missing fields" }
```

#### Game not found

```http request
HTTP/1.1 452 Unknown
content-type: application/json

{ "message": "452 - Game not found" }
```

#### Player already in game

```http request
HTTP/1.1 453 Unknown
content-type: application/json

{ "message": "453 - Player already in game" }
```

#### Player not in game

```http request
HTTP/1.1 454 Unknown
content-type: application/json

{ "message": "454 - Player not in game" }
```

#### Not enough players

```http request
HTTP/1.1 455 Unknown
content-type: application/json

{ "message": "455 - Not enough players" }
```

#### Game has already started

```http request
HTTP/1.1 456 Unknown
content-type: application/json

{ "message": "456 - Game has already started" }
```

#### Game progress tampering: illegal action

```http request
HTTP/1.1 457 Unknown
content-type: application/json

{ "message": "457 - Game progress can't be tampered with" }
```

#### Ineligible player

```http request
HTTP/1.1 458 Unknown
content-type: application/json

{ "message": "458 - Player is ineligible" }
```
