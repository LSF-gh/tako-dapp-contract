import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 [純 Ethers 模式] 開始部署智能合約...");

  // 1. 直接連線到你開著的本地虛擬區塊鏈 (預設埠為 8545)
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  // 2. 取得虛擬區塊鏈給你的第一個預設帳戶來當部署者
  const signer = await provider.getSigner(0);
  console.log(`👤 部署帳戶地址: ${await signer.getAddress()}`);

  // 3. 實體讀取你之前成功編譯出來的合約說明書 (ABI 與 Bytecode)
  const artifactPath = path.resolve(
    process.cwd(),
    "artifacts/contracts/CrowdfundingPlatform.sol/CrowdfundingPlatform.json"
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`❌ 找不到編譯檔案，請確認路徑或先執行 npx hardhat compile`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // 4. 建立合約工廠並發射
  console.log("📦 正在打包合約並送上區塊鏈...");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  // 5. 勝利宣言
  console.log(`\n✅ 智能合約部署成功！`);
  console.log(`📍 合約地址: ${await contract.getAddress()}\n`);
}

main().catch((error) => {
  console.error("❌ 部署程序發生錯誤:", error);
  process.exitCode = 1;
});