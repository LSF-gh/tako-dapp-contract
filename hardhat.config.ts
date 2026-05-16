import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-mocha-ethers"; // 👈 載入測試引擎

const config: HardhatUserConfig = {
  solidity: "0.8.20", // 👈 對齊你的合約版本
};

export default config;