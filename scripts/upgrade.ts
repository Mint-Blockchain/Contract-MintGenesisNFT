import { ethers, upgrades } from "hardhat";
import { GlobalConfig } from "./config";

async function main() {
  const V1contract = await ethers.getContractFactory("MintGenesisNFT");
  await upgrades.upgradeProxy(GlobalConfig.contract_mainnet, V1contract, {
    kind: "uups",
  });
  console.log("Upgrade success");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
