import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers"; // 👈 只要這一行，其餘 toolbox 的都不要

const config: HardhatUserConfig = {
  solidity: "0.8.24",
};

export default config;a