import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Merkle } from "./utils/markle";

// treasuryAddress
const treasuryAddress = "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199";

const day = 60 * 60 * 24;

function getNow() {
  return Math.floor(Date.now() / 1000);
}

function generateWallet() {
  const wallet = ethers.Wallet.createRandom(ethers.provider);
  return wallet;
}

describe("MintGenesisPass", () => {
  async function deployFixture() {
    const V1contract = await ethers.getContractFactory("MintGenesisPass");
    const [owner, otherAccount] = await ethers.getSigners();
    const v1contract = await upgrades.deployProxy(
      V1contract as any,
      [treasuryAddress],
      {
        initializer: "initialize",
        kind: "uups",
      }
    );
    const contract = await v1contract.waitForDeployment();

    // generate wallets for test
    const publicUser = generateWallet();
    await owner.sendTransaction({
      to: publicUser.address,
      value: ethers.parseEther("2"),
    });
    const wlUser = generateWallet();
    await owner.sendTransaction({
      to: wlUser.address,
      value: ethers.parseEther("2"),
    });

    return {
      contract,
      treasuryAddress,
      owner,
      otherAccount,
      publicUser,
      wlUser,
    };
  }

  async function setRightContract(contract: any) {
    // set config
    const startDate = getNow() - day;
    const endDate = getNow() + day;
    await contract.setMintConfig(startDate, endDate);
  }

  describe("Deployment", () => {
    it("Set right treasuryAddress", async () => {
      const { contract, treasuryAddress } = await loadFixture(deployFixture);
      await expect(await contract.treasuryAddress()).to.equal(treasuryAddress);
    });

    it("Set right owner", async () => {
      const { contract, owner } = await loadFixture(deployFixture);
      await expect(await contract.owner()).to.equal(owner.address);
    });
  });

  describe("Mint condition", () => {
    it("Not start mint", async () => {
      const { contract, publicUser } = await loadFixture(deployFixture);
      await contract.setMintConfig(getNow() + day, getNow() + 2 * day);
      const merkle = new Merkle(publicUser.address);

      await expect(
        contract.mint(merkle.getProof(publicUser.address))
      ).to.be.revertedWithCustomError(contract, "MintNotStart");
    });
    it("Already finish mint", async () => {
      const { contract, publicUser } = await loadFixture(deployFixture);
      await contract.setMintConfig(getNow() - 2 * day, getNow() - day);
      const merkle = new Merkle(publicUser.address);

      await expect(
        contract.mint(merkle.getProof(publicUser.address))
      ).to.be.revertedWithCustomError(contract, "MintFinished");
    });
  });

  describe("Mint", async () => {
    it("Not be verified", async () => {
      const { contract, publicUser, wlUser } = await loadFixture(deployFixture);
      await setRightContract(contract);
      const merkle = new Merkle(wlUser.address);
      await contract.setMerkleRoot(merkle.getRoot());
      const publicCaller = contract.connect(publicUser);

      await expect((publicCaller as any).mint(merkle.getProof(wlUser.address)))
        .to.be.revertedWithCustomError(contract, "UnauthorizedMinter")
        .withArgs(publicUser.address);
    });
    it("Mint 1 item", async () => {
      const { contract, publicUser, wlUser, owner } = await loadFixture(
        deployFixture
      );
      await setRightContract(contract);
      const merkle = new Merkle(wlUser.address);
      await contract.setMerkleRoot(merkle.getRoot());
      const wlCaller = contract.connect(wlUser);
      await (wlCaller as any).mint(merkle.getProof(wlUser.address));

      await expect(await contract.balanceOf(wlUser.address)).to.equal(1);
      await expect(await contract.totalSupply()).to.equal(1);
    });
  });

  describe("Royalty", async () => {
    it("Set wrong royalty beacause out of range", async () => {
      const { contract, publicUser } = await loadFixture(deployFixture);
      await expect(contract.setRoyalty(101)).to.be.revertedWith(
        "MP: Royalty can only be between 0 and 10%"
      );
    });
    it("Set right royalty", async () => {
      const { contract } = await loadFixture(deployFixture);
      await contract.setRoyalty(100);
      await expect(await contract.royalty()).to.be.equal(100);
    });
    it("TokenId is not exist when get royalty info", async () => {
      const { contract } = await loadFixture(deployFixture);
      await expect(contract.royaltyInfo(101, ethers.parseEther("2")))
        .to.be.revertedWithCustomError(contract, "TokenNotMinted")
        .withArgs(101);
    });
    it("Get right royalty info", async () => {
      const { contract, wlUser } = await loadFixture(deployFixture);
      await setRightContract(contract);
      const merkle = new Merkle(wlUser.address);
      await contract.setMerkleRoot(merkle.getRoot());
      const wlCaller = contract.connect(wlUser);
      await (wlCaller as any).mint(merkle.getProof(wlUser.address));
      const value = ethers.parseEther("1");
      const [address, amount] = await contract.royaltyInfo(1, value);
      await expect(amount).to.be.equal(value / BigInt(20));
      await expect(address).to.be.equal(treasuryAddress);
    });
  });

  describe("Withdrawl", async () => {
    it("Public wallet can not withdraw", async () => {
      const { contract, publicUser, owner } = await loadFixture(deployFixture);
      await setRightContract(contract);
      const contractCaller = contract.connect(publicUser);
      await expect((contractCaller as any).withdraw())
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount")
        .withArgs(publicUser.address);
    });
    it("Owner withdraw ETH to treasure address", async () => {
      const { contract, wlUser } = await loadFixture(deployFixture);
      await setRightContract(contract);
      const merkle = new Merkle(wlUser.address);
      await contract.setMerkleRoot(merkle.getRoot());
      const usedValue = ethers.parseEther("0.01");
      const wlCaller = contract.connect(wlUser);
      await (wlCaller as any).mint(merkle.getProof(wlUser.address), {
        value: usedValue,
      });

      const beforeBanlance = await ethers.provider.getBalance(treasuryAddress);
      await contract.withdraw();
      const afterBanlance = await ethers.provider.getBalance(treasuryAddress);
      await expect(afterBanlance - beforeBanlance).to.be.equal(usedValue);
      await expect(
        await ethers.provider.getBalance(contract.getAddress())
      ).to.be.equal(0);
    });
  });

  describe("Contract Upgrade", async () => {
    it("public wallet call upgrade function", async () => {
      const { contract, publicUser, owner } = await loadFixture(deployFixture);
      const V2Contract = await ethers.getContractFactory("MintGenesisPass");
      const v2 = await V2Contract.deploy();
      const data = contract.interface.encodeFunctionData("setTreasuryAddress", [
        owner.address,
      ]);
      const publicCaller = contract.connect(publicUser);
      await expect(
        (publicCaller as any).upgradeToAndCall(await v2.getAddress(), data)
      )
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount")
        .withArgs(publicUser.address);
    });
    it("Upgrade successsfully", async () => {
      const { contract, publicUser, owner } = await loadFixture(deployFixture);
      const v2Contract = await ethers.getContractFactory("MintGenesisPass");
      contract.abi;
      const upgradeContract = await upgrades.upgradeProxy(
        contract,
        v2Contract,
        {
          kind: "uups",
          call: {
            fn: "setTreasuryAddress",
            args: [owner.address],
          },
        }
      );
      await expect(await upgradeContract.treasuryAddress()).to.be.equal(
        owner.address
      );
    });
  });
});
