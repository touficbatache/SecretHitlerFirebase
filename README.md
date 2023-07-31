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
