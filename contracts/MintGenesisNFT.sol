// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "erc721a-upgradeable/contracts/ERC721AUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "./IMetadataRenderer.sol";

contract MintGenesisNFT is
    ERC721AUpgradeable,
    IERC2981,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    struct MintConfig {
        uint32 startTime;
        uint32 endTime;
    }

    MintConfig public mintConfig;
    uint8 constant maxMintPerAddress = 1;
    uint256 constant DENO = 1000;

    uint256 public royalty;
    address public treasuryAddress;

    bytes32 public markleRoot;

    address public metadataRenderer;

    error InvalidCaller();
    error MintNotStart();
    error MintFinished();
    error MintedAlready(address minter);
    error TokenNotMinted(uint256 tokenId);
    error UnauthorizedMinter(address minter);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _address
    ) public initializerERC721A initializer {
        __ERC721A_init("Mint Genesis NFT", "MGN");
        __UUPSUpgradeable_init();
        __Pausable_init();
        __Ownable_init(_msgSender());

        royalty = 50;
        treasuryAddress = address(_address);
    }

    modifier isEOA() {
        if (tx.origin != msg.sender) revert InvalidCaller();
        _;
    }

    function minted() external view returns (uint256) {
        return _totalMinted();
    }

    // Merkle verify
    function _verify(
        address _account,
        bytes32[] memory _proof
    ) internal view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(_account));
        return MerkleProof.verify(_proof, markleRoot, leaf);
    }

    function _startTokenId() internal view virtual override returns (uint256) {
        return 1;
    }

    function mint(
        bytes32[] calldata _proof
    ) external payable isEOA whenNotPaused {
        address account = _msgSender();
        if (block.timestamp < mintConfig.startTime) revert MintNotStart();
        if (block.timestamp > mintConfig.endTime) revert MintFinished();
        if (!_verify(account, _proof)) revert UnauthorizedMinter(account);
        if (_numberMinted(account) > 0) revert MintedAlready(account);
        _safeMint(account, maxMintPerAddress);
    }

    /// @param tokenId token id to render
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();
        return IMetadataRenderer(metadataRenderer).tokenURI(tokenId);
    }

    function setMetadataRenderer(address _metadataRenderer) public onlyOwner {
        metadataRenderer = _metadataRenderer;
    }

    /**
     * @inheritdoc IERC2981
     */
    function royaltyInfo(
        uint256 tokenId,
        uint256 salePrice
    ) external view override returns (address, uint256) {
        if (!super._exists(tokenId)) revert TokenNotMinted(tokenId);
        uint256 royaltyAmount = (salePrice * royalty) / DENO;
        return (treasuryAddress, royaltyAmount);
    }

    function setMintConfig(
        uint32 _startTime,
        uint32 _endTime
    ) external onlyOwner {
        require(_endTime > _startTime, "MP: MUST(end time  > Start time)");
        mintConfig = MintConfig(_startTime, _endTime);
    }

    function setMerkleRoot(bytes32 _root) external onlyOwner {
        markleRoot = _root;
    }

    function setRoyalty(uint256 _royalty) external onlyOwner {
        require(
            _royalty <= 100 && _royalty >= 0,
            "MP: Royalty can only be between 0 and 10%"
        );
        royalty = _royalty;
    }

    function setTreasuryAddress(address _addr) external onlyOwner {
        require(_addr != address(0x0), "MP: Can't set zero address");
        treasuryAddress = _addr;
    }

    function withdraw() external onlyOwner {
        require(
            treasuryAddress != address(0x0),
            "MP: Must set Withdrawal address"
        );
        (bool success, ) = treasuryAddress.call{value: address(this).balance}(
            ""
        );
        require(success, "MP: Transfer failed");
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721AUpgradeable, IERC165) returns (bool) {
        return ERC721AUpgradeable.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
