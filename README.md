# Secret Hitler - Firebase API

Secret Hitler's Firebase Functions API source code.

## Description

Written using TypeScript, with enforced typing.

## How to install?

```shell
git clone https://github.com/touficbatache/SecretHitlerFirebase.git
cd SecretHitlerFirebase
npm install
```

This API is supposed to be deployed to a Firebase project and used with Functions.

To link it, first create a Firebase project, then run the following command:

```shell
npm run link --project=[PROJECTNAME]
```

## Run in dev mode

Inside to the `functions/` directory, link a new `.env` file to the existing `example.env` and adjust it to your needs:

```shell
ln -s example.env .env
```

Then execute the following command, which listens to code changes when building and runs the Firebase Emulator locally:

```shell
npm run serve
```

The Emulator UI can be accessed using the URL shown in the terminal, usually http://localhost:4002/.

## Deploy to production

```shell
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
