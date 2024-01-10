import { ethers, upgrades } from "hardhat";

async function main() {
  const V1contract = await ethers.getContractFactory("MintGenesisNFT");
  console.log("Deploying V1contract...");
  const v1contract = await upgrades.deployProxy(
    V1contract as any,
    ["0x93236C72E827EF476c79d85CF1d03505cEc061Cd"],
    {
      kind: "uups",
    }
  );
  await v1contract.waitForDeployment();
  console.log("V1 Contract deployed to:", await v1contract.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
