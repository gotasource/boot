# Gota Boot

Gota Boot is a development framework for building REST web services API using Typescript/JavaScript on Node Environment.

## Quickstart
### Step 1. Set up the Development Environment
You need to set up your development environment before you can do anything.

Install [NodeJS][nodejs_download] and [Git SCM][git-scm] if they are not already on your machine.

Then install the [Gota CLI][gota_cli_github] globally.
```bash
npm install -g @gota/cli
```

### Step 2. Clone Quickstart source.
```bash
git clone https://github.com/gotasource/gota-quickstart.git quickstart
```
### Step 3. Install and build source.
Go to the project directory 
```bash
cd quickstart
```
Install
```bash
npm install
```
Build
```bash
npm run build
```
### Step 4. Start Services.
```bash
npm run start
```
 open your browser on [http://localhost:3001/store-service/products/2][quick_start_hello]

[gota_cli_github]:https://github.com/gotasource/cli
[nodejs_download]: https://nodejs.org/en/download/
[git-scm]:https://git-scm.com/
[quick_start_hello]:http://localhost:3001/store-service/products/2
