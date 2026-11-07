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

The rules engine (`functions/src/engine`, see its [README](functions/src/engine/README.md)) has its own
tests, which need no emulator and run in seconds, along with the tests of the adapter between the
database and the engine. From `functions/`:

```shell
npm run test:engine
```

The other tests play games through the API against the Firebase emulators (functions and database), in
dev mode. They cover the game rules, concurrent requests, phase timing, lobbies and the database
security rules. From `functions/`:

```shell
npm test
```

This runs the engine tests, then builds the functions, starts the emulators on the `demo-shtest` project (`DEV=true` comes from
`functions/.env.demo-shtest`), runs every file in `functions/test/` and stops the emulators. A
`functions/.env.local` file also applies to the emulator: make sure it doesn't set `DEV=false`.

`npm run lint` checks the formatting and the lint rules (`npm run lint:fix` fixes what it can). GitHub
Actions runs the lint and all the tests on every pull request and on `master`
(`.github/workflows/ci.yml`).

## Deploy to production

Every merge to `master` deploys itself: once the tests pass, GitHub Actions deploys the functions
and the database security rules to the Firebase project (`.github/workflows/ci.yml`). The app
([SecretHitlerSvelte](https://github.com/touficbatache/SecretHitlerSvelte)) deploys the same way
from its own repository.

To deploy by hand instead, from `functions/`:

```shell
firebase deploy --only functions,database --project [PROJECTNAME]
```

### Continuous deployment: one-time setup

GitHub Actions logs in to Google Cloud without a stored key (Workload Identity Federation): GitHub
proves to Google that the job runs on `master` of one of the two repositories, and Google lets it
act as a deploy-only service account. Run this once with the
[gcloud CLI](https://cloud.google.com/sdk/docs/install), logged in as an owner of the project:

```shell
PROJECT_ID=[PROJECTNAME]
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
DEPLOYER=github-deploy@$PROJECT_ID.iam.gserviceaccount.com

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project $PROJECT_ID

# Only the master branch of these two repositories can log in
gcloud iam workload-identity-pools create github --project $PROJECT_ID --location global
gcloud iam workload-identity-pools providers create-oidc github --project $PROJECT_ID \
  --location global --workload-identity-pool github \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping 'google.subject=assertion.sub,attribute.repository=assertion.repository' \
  --attribute-condition "assertion.repository in ['touficbatache/SecretHitlerFirebase', 'touficbatache/SecretHitlerSvelte'] && assertion.ref == 'refs/heads/master'"

# The account the deploys run as, with what deploying the functions, the rules and the app needs
gcloud iam service-accounts create github-deploy --project $PROJECT_ID
for role in firebase.admin cloudfunctions.admin run.admin cloudbuild.builds.editor \
  artifactregistry.writer iam.serviceAccountUser serviceusage.serviceUsageConsumer \
  serviceusage.apiKeysViewer; do
  gcloud projects add-iam-policy-binding $PROJECT_ID --member serviceAccount:$DEPLOYER \
    --role roles/$role --condition None
done

for repo in SecretHitlerFirebase SecretHitlerSvelte; do
  gcloud iam service-accounts add-iam-policy-binding $DEPLOYER --project $PROJECT_ID \
    --role roles/iam.workloadIdentityUser \
    --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/touficbatache/$repo"
done

# Lets deploys clean up old function images without asking (a deploy can't answer questions)
firebase functions:artifacts:setpolicy --project $PROJECT_ID

echo "GCP_WORKLOAD_IDENTITY_PROVIDER = projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
echo "GCP_SERVICE_ACCOUNT = $DEPLOYER"
echo "FIREBASE_PROJECT = $PROJECT_ID"
```

Then, in **both** repositories on GitHub (Settings, Secrets and variables, Actions, Variables), add
the three repository variables the last commands print. None of them is a secret. The app's
repository also needs its production `.env` file as a secret: see its README.

A deploy that can't log in fails with a message naming what's missing. The deploys appear under
the `production` environment on GitHub, where an approval step can be added later (Settings,
Environments, production, Required reviewers).

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
