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

Then execute the following commands, which listen to code changes when building and runs the Firebase Emulator locally:

```shell
npm run serve
```

The Emulator UI can be accessed using the URL shown in the terminal, usually http://localhost:4002/.

## Deploy to production

```shell
npm run deploy
```

## API call examples

POST http://127.0.0.1:5001/secret-hitler-app/us-central1/api/[route]/

- ### /newGame/
```
NO BODY
```

- ### /joinGame/
```json
{
    "code": "[GAMECODE]"
}
```

- ### /startGame/
GAME OWNER ONLY
```json
{
    "code": "[GAMECODE]",
    "hidePicsGameInfo": "[BOOLEAN]",
    "skipLongIntro": "[BOOLEAN]"
}
```

- ### /chooseChancellor/
PRESIDENT ONLY
```json
{
    "code": "[GAMECODE]",
    "chancellorId": "[PLAYER_ID]"
}
```

- ### /vote/
```json
{
    "code": "[GAMECODE]",
    "vote": "[BOOLEAN]"
}
```

- ### /presidentDiscardPolicy/
PRESIDENT ONLY
```json
{
    "code": "[GAMECODE]",
    "policy": "[POLICY]"
}
```

- ### /chancellorDiscardPolicy/
CHANCELLOR ONLY
```json
{
    "code": "[GAMECODE]",
    "policy": "[POLICY]"
}
```

- ### /presidentialPower/
  - Policy Peek
  ```json
  {
      "code": "[GAMECODE]"
  }
  ```
  CALL AGAIN TO CONTINUE

  - Investigation
  ```json
  {
      "code": "[GAMECODE]",
      "player": "[PLAYER_ID]"
  }
  ```
  CALL AGAIN TO CONTINUE

  - Special election
  ```json
  {
    "code": "[GAMECODE]",
    "player": "[PLAYER_ID]"
  }
  ```

  - Execution
  ```json
  {
    "code": "[GAMECODE]",
    "player": "[PLAYER_ID]"
  }
  ```
  
- ### /askForVeto/
CHANCELLOR ONLY
```json
{
  "code": "[GAMECODE]"
}
```

- ### /answerVeto/
PRESIDENT ONLY
```json
{
  "code": "[GAMECODE]",
  "refuseVeto": "[BOOLEAN"
}
```
