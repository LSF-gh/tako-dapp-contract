Markdown

# Tako Crowdfunding dApp 🐙

This is a decentralized crowdfunding platform (dApp) built on Ethereum. The project follows a Monorepo structure, organizing the smart contract backend and the React frontend into a unified repository.

- **Smart Contract Framework:** Hardhat 3 (ESM Mode)
- **Frontend Framework:** React + Vite + Ethers.js

---

## 📂 Project Structure

```text
tako-dapp-contract/
├── contracts/          # Solidity smart contract source files
├── scripts/            # Deployment scripts
├── test/               # Smart contract unit test files
├── frontend/           # React + Vite frontend web application
├── hardhat.config.ts   # Hardhat configuration file
└── README.md           # This instruction document

🛠️ Prerequisites

Before running this project, ensure you have the following installed on your machine:

    Node.js (v18 or higher recommended)

    Git

🧠 Backend: Contract Compilation, Testing, and Deployment

Open your terminal, ensure you are in the root directory (tako-dapp-contract), and install the backend dependencies:
Bash

npm install

1. Compile the Contracts

Compile the Solidity smart contracts and generate the required ABIs:
Bash

npx hardhat compile

Upon successful compilation, the artifacts/ and cache/ directories will be generated in the root.
2. Run Unit Tests

Execute the automated test scripts to verify the smart contract logic:
Bash

npx hardhat test

3. Deploy to Local Network

To run the dApp locally, follow these two steps in order:

Step A: Start the local virtual blockchain node
Bash

npx hardhat node

Keep this terminal window open. The node will run at http://127.0.0.1:8545.

Step B: Open a new terminal window/tab and run the deployment script
Bash

npx hardhat run scripts/deploy.ts --network localhost

Once successfully deployed, the terminal will display the 📍 Contract Address.
🎨 Frontend: Web Application Setup

Switch to the frontend directory and install the necessary web packages:
Bash

cd frontend
npm install

1. Start the Local Development Server

Run the following command to boot up the Vite development server:
Bash

npm run dev

2. Browse the Web Application

Once the server is running, open the local URL in your web browser:
Plaintext

http://localhost:5173/

The web interface will now render. You can connect your Web3 wallet (e.g., MetaMask) to interact with the smart contracts on your local network!
📸 UI Preview

<img width="921" height="715" alt="CreatorDashboard" src="[https://github.com/user-attachments/assets/e00677e4-2ffb-477b-8b26-0e54e89eda64](https://github.com/user-attachments/assets/e00677e4-2ffb-477b-8b26-0e54e89eda64)" />

<img width="1385" height="737" alt="BackerDashboard" src="[https://github.com/user-attachments/assets/f5c12de3-56c2-4921-b9c1-fc81cd23fee4](https://github.com/user-attachments/assets/f5c12de3-56c2-4921-b9c1-fc81cd23fee4)" />

