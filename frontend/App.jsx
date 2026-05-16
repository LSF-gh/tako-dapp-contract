import { useState } from 'react';
import { ethers } from 'ethers';

// 1. 網路守衛：設定我們只允許 Sepolia 測試網 (Hex ID: 0xaa36a7)
const EXPECTED_CHAIN_ID = '0xaa36a7'; 

// 2. 你的智能合約真實門牌號碼 
const CONTRACT_ADDRESS = "0x306a64abF4831929A8D48B069EeFa82cA0CC0E7C";

// 3. 100% 嚴格對齊最新版 Solidity 函數名稱與參數的 ABI
const CONTRACT_ABI = [
  "function createCampaign(uint256 _goal, uint256 _duration, uint256 _numMilestones) payable",
  "function contribute(uint256 _id) payable",
  "function submitMilestoneEvidence(uint256 _id, string _evidenceLink)",
  "function voteOnMilestone(uint256 _id, bool _support)",
  "function withdrawReleasedFunds(uint256 _id)",
  "function requestRefund(uint256 _id)",
  "function recoverRiskDeposit(uint256 _id)"
];

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [contract, setContract] = useState(null);
  
  const [activeTab, setActiveTab] = useState('creator');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // === 連接錢包 ===
  const connectWallet = async () => {
    if (!window.ethereum) {
      setErrorMsg("Please install MetaMask!");
      return;
    }

    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
      
      if (currentChainId !== EXPECTED_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: EXPECTED_CHAIN_ID }],
          });
        } catch (switchError) {
          setErrorMsg("Please manually switch your MetaMask to the Sepolia testnet!");
          return;
        }
      }

      const _provider = new ethers.BrowserProvider(window.ethereum);
      const _signer = await _provider.getSigner();
      const _address = await _signer.getAddress();
      const _contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, _signer);
      
      setProvider(_provider);
      setSigner(_signer);
      setWalletAddress(_address);
      setContract(_contract);
      setSuccessMsg("Wallet connected successfully!");
      setErrorMsg('');
    } catch (err) {
      setErrorMsg("Failed to connect wallet or switch network.");
    }
  };

  // === 交易執行包裹器 ===
  const executeTransaction = async (transactionAction) => {
    if (!contract) {
      setErrorMsg("Please connect your wallet first!");
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const tx = await transactionAction();
      await tx.wait(); // 等待區塊鏈鏈上確認
      setSuccessMsg("Transaction successful!");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.reason || err.shortMessage || err.message || "Transaction failed");
    } finally {
      setIsLoading(false);
    }
  };

  // === Creator Functions ===
  const handleCreateCampaign = (e) => {
    e.preventDefault();
    const goal = e.target.goal.value;
    const days = e.target.days.value;
    const milestones = e.target.milestones.value;
    
    executeTransaction(() => 
      contract.createCampaign(
        ethers.parseEther(goal), 
        BigInt(days) * 86400n, 
        BigInt(milestones),
        { value: ethers.parseEther("0.01") } // 扣除基礎聲譽押金 0.01 ETH [cite: 19, 130]
      )
    );
  };

  // 【更新】現在會同時抓取 Campaign ID 與 證明連結，並傳入合約 
  const handleSubmitEvidence = (e) => {
    e.preventDefault();
    const id = BigInt(e.target.campaignId.value);
    const link = e.target.link.value;
    executeTransaction(() => 
      contract.submitMilestoneEvidence(id, link)
    );
  };

  // 【更新】名稱對齊合約的 withdrawReleasedFunds [cite: 205]
  const handleWithdrawFunds = (e) => {
    e.preventDefault();
    executeTransaction(() => 
      contract.withdrawReleasedFunds(BigInt(e.target.campaignId.value))
    );
  };

  const handleRecoverDeposit = (e) => {
    e.preventDefault();
    executeTransaction(() => 
      contract.recoverRiskDeposit(BigInt(e.target.campaignId.value))
    );
  };

  // === Backer Functions ===
  const handleContribute = (e) => {
    e.preventDefault();
    const amount = e.target.amount.value;
    executeTransaction(() => 
      contract.contribute(BigInt(e.target.campaignId.value), { value: ethers.parseEther(amount) })
    );
  };

  const handleVote = (e) => {
    e.preventDefault();
    const isApprove = e.target.decision.value === 'true';
    executeTransaction(() => 
      contract.voteOnMilestone(BigInt(e.target.campaignId.value), isApprove)
    );
  };

  // 【更新】名稱對齊合約的 requestRefund [cite: 231]
  const handleRequestRefund = (e) => {
    e.preventDefault();
    executeTransaction(() => 
      contract.requestRefund(BigInt(e.target.campaignId.value))
    );
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.logo}>🐙 Takoyaki DAO</h1>
        <div style={styles.walletSection}>
          <span style={styles.address}>
            {walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}` : 'Not Connected'}
          </span>
          {!walletAddress && (
            <button onClick={connectWallet} style={styles.connectBtn}>Connect Wallet</button>
          )}
        </div>
      </header>

      {/* Alerts */}
      {errorMsg && <div style={{...styles.alert, ...styles.alertError}}>🚨 {errorMsg}</div>}
      {successMsg && <div style={{...styles.alert, ...styles.alertSuccess}}>✅ {successMsg}</div>}

      {/* Tabs */}
      <div style={styles.tabContainer}>
        <button 
          style={activeTab === 'creator' ? {...styles.tabBtn, ...styles.activeTab} : styles.tabBtn}
          onClick={() => setActiveTab('creator')}
        >
          👨‍💻 Creator Dashboard
        </button>
        <button 
          style={activeTab === 'backer' ? {...styles.tabBtn, ...styles.activeTab} : styles.tabBtn}
          onClick={() => setActiveTab('backer')}
        >
          💎 Backer Dashboard
        </button>
      </div>

      {/* Creator Dashboard */}
      {activeTab === 'creator' && (
        <div style={styles.grid}>
          <form style={styles.card} onSubmit={handleCreateCampaign}>
            <h3>🚀 Create Campaign</h3>
            <p style={styles.subtitle}>Requires 0.01 ETH Reputation Stake</p>
            <input name="goal" placeholder="Goal Amount (ETH)" required style={styles.input} />
            <input name="days" placeholder="Duration (Days)" type="number" required style={styles.input} />
            <input name="milestones" placeholder="Number of Milestones" type="number" required style={styles.input} />
            <button type="submit" style={styles.actionBtn}>Create</button>
          </form>

          {/* 【更新】這裡增加了 Evidence Link 的輸入框，完美對齊合約參數！ */}
          <form style={styles.card} onSubmit={handleSubmitEvidence}>
            <h3>📁 Submit Milestone Evidence</h3>
            <p style={styles.subtitle}>Upload proof-of-work & initiate 48H challenge window</p>
            <input name="campaignId" placeholder="Campaign ID" type="number" required style={styles.input} />
            <input name="link" placeholder="Evidence Link (e.g. IPFS / Drive URL)" required style={styles.input} />
            <button type="submit" style={{...styles.actionBtn, background: '#a855f7'}}>Submit & Start Voting</button>
          </form>

          <form style={styles.card} onSubmit={handleWithdrawFunds}>
            <h3>💰 Withdraw Funds</h3>
            <p style={styles.subtitle}>Withdraw unlocked segment after voting deadline</p>
            <input name="campaignId" placeholder="Campaign ID" type="number" required style={styles.input} />
            <button type="submit" style={{...styles.actionBtn, background: '#10b981'}}>Claim Unlocked Funds</button>
          </form>

          <form style={styles.card} onSubmit={handleRecoverDeposit}>
            <h3>🛡️ Recover Risk Deposit</h3>
            <p style={styles.subtitle}>Get back 0.01 ETH if campaign failed and expired</p>
            <input name="campaignId" placeholder="Campaign ID" type="number" required style={styles.input} />
            <button type="submit" style={{...styles.actionBtn, background: '#475569'}}>Recover Deposit</button>
          </form>
        </div>
      )}

      {/* Backer Dashboard */}
      {activeTab === 'backer' && (
        <div style={styles.grid}>
          <form style={styles.card} onSubmit={handleContribute}>
            <h3>💎 Contribute</h3>
            <input name="campaignId" placeholder="Campaign ID" type="number" required style={styles.input} />
            <input name="amount" placeholder="Amount (ETH)" required style={styles.input} />
            <button type="submit" style={styles.actionBtn}>Pledge Funds</button>
          </form>

          <form style={styles.card} onSubmit={handleVote}>
            <h3>🗳️ Vote on Milestone</h3>
            <input name="campaignId" placeholder="Campaign ID" type="number" required style={styles.input} />
            <select name="decision" style={styles.input}>
              <option value="true">👍 Approve (Release Funds)</option>
              <option value="false">👎 Reject</option>
            </select>
            <button type="submit" style={{...styles.actionBtn, background: '#6366f1'}}>Cast Vote</button>
          </form>

          <form style={styles.card} onSubmit={handleRequestRefund}>
            <h3>🛡️ Claim Refund</h3>
            <p style={styles.subtitle}>Eligible if campaign fails or gets blocked</p>
            <input name="campaignId" placeholder="Campaign ID" type="number" required style={styles.input} />
            <button type="submit" style={{...styles.actionBtn, background: '#ef4444'}}>Withdraw Refund</button>
          </form>
        </div>
      )}

      {/* Loading Mask */}
      {isLoading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.spinner}></div>
          <p style={{marginTop: '20px', color: 'white', fontWeight: 'bold'}}>Waiting for blockchain confirmation...</p>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#0f172a', backgroundImage: 'radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), radial-gradient(at 50% 0%, hsla(225,39%,30%,1) 0, transparent 50%), radial-gradient(at 100% 0%, hsla(339,49%,30%,1) 0, transparent 50%)', color: '#f8fafc', fontFamily: '"Inter", -apple-system, sans-serif', padding: '20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '15px 30px', borderRadius: '16px', marginBottom: '30px' },
  logo: { margin: 0, fontSize: '24px', fontWeight: 'bold', background: '-webkit-linear-gradient(#6ee7b7, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  walletSection: { display: 'flex', alignItems: 'center', gap: '15px' },
  address: { fontFamily: 'monospace', color: '#94a3b8', fontSize: '14px' },
  connectBtn: { background: '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  alert: { padding: '15px', borderRadius: '8px', marginBottom: '20px', fontWeight: '500', backdropFilter: 'blur(5px)' },
  alertError: { background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5' },
  alertSuccess: { background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', color: '#6ee7b7' },
  tabContainer: { display: 'flex', gap: '10px', marginBottom: '30px', justifyContent: 'center' },
  tabBtn: { background: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', transition: '0.3s' },
  activeTab: { background: 'rgba(59, 130, 246, 0.2)', color: '#fff', border: '1px solid #3b82f6' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' },
  card: { background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '25px', display: 'flex', flexDirection: 'column', gap: '10px' },
  subtitle: { color: '#94a3b8', fontSize: '12px', marginTop: '-10px', marginBottom: '10px' },
  input: { background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px', borderRadius: '8px', outline: 'none', fontSize: '14px' },
  actionBtn: { background: '#3b82f6', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', marginTop: '10px', transition: '0.2s' },
  loadingOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  spinner: { width: '50px', height: '50px', border: '5px solid rgba(255,255,255,0.1)', borderTop: '5px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);
