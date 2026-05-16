// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // SECURITY FIX: 引入防重入鎖

// 1. TAKO Token Contract
contract TAKOToken is ERC20 {
    constructor(address platformAddress) ERC20("Tako Token", "TAKO") {
        uint256 totalSupply = 100_000_000 * 10**18;
        _mint(platformAddress, (totalSupply * 30) / 100);
        _mint(msg.sender, (totalSupply * 70) / 100);
    }
}

// 2. Main Platform Contract
// SECURITY FIX: 繼承 ReentrancyGuard
contract CrowdfundingPlatform is ReentrancyGuard {
    TAKOToken public takoToken;
    address public immutable platformAddress;

    // Constants & Logic Limits
    uint public constant BASE_RISK_DEPOSIT = 0.01 ether;
    uint public constant PENALTY_PER_ABANDON = 0.1 ether;
    uint public constant INITIAL_FEE_BPS = 500; // 5%
    uint public constant MIN_FEE_BPS = 200;     // 2%
    uint public constant REDUCTION_PER_ETH = 5; // 0.05%
    uint public constant TAKO_REWARD_AMOUNT = 10 * 10**18;

    struct Milestone {
        uint amount;
        bool approved;
        bool votingStarted;
        uint votingDeadline;
        uint supportScore;
        uint objectionScore;
    }

    struct Campaign {
        address payable creator;
        uint goal;
        uint deadline;
        uint totalRaised;
        uint currentBalance;
        uint riskDeposit;
        bool isFailed;
        uint totalScorePossible;
        uint currentMilestone;
        uint numMilestones;
        uint platformFeeBPS;
        mapping(address => uint) lockedVoterScore;
        mapping(uint => Milestone) milestones;
    }

    struct PendingVote {
        uint campaignId;
        uint milestoneId;
        bool support;
        bool active;
    }

    uint public campaignCount;
    mapping(uint => Campaign) private campaigns;
    mapping(address => uint) public abandonedCount;
    mapping(uint => mapping(address => uint)) public contributions;
    mapping(uint => mapping(uint => mapping(address => bool))) public hasVoted;

    mapping(address => uint) private rawVoterScore;
    mapping(address => PendingVote) public lastVoteRecord;
    mapping(address => uint) public totalSuccessfulVolume;

    // --- FRONTEND dApp EVENTS ---
    event CampaignCreated(uint indexed id, address indexed creator, uint goal, uint deposit, uint feeBPS);
    event ContributionReceived(uint indexed id, address indexed contributor, uint amount);
    // 【規格修正】在事件中補上 evidenceLink 欄位，方便前端與區塊鏈瀏覽器讀取證明
    event MilestoneRequested(uint indexed id, uint indexed milestoneId, uint deadline, string evidenceLink);
    event Voted(uint indexed campaignId, uint indexed milestoneId, address indexed voter, bool support, uint scoreUsed);
    event CampaignBlocked(uint indexed id, uint objectionScore);
    event RewardIssued(address indexed voter, uint amount);
    event MilestoneReleased(uint indexed campaignId, uint indexed milestoneId, uint amount);
    event Refunded(uint indexed campaignId, address indexed contributor, uint amount);
    event RiskDepositRecovered(uint indexed campaignId, address indexed creator, uint amount);

    modifier validCampaign(uint _id) {
        require(_id > 0 && _id <= campaignCount, "Invalid campaign ID");
        _;
    }

    constructor(address _platformAddress) {
        platformAddress = _platformAddress;
        takoToken = new TAKOToken(_platformAddress);
    }

    // --- View & Read-Only Functions ---
    function getCampaignBasicInfo(uint _id) external view validCampaign(_id) returns (
        address creator, uint goal, uint deadline, uint totalRaised,
        uint currentBalance, bool isFailed, uint currentMilestone,
        uint platformFeeBPS, uint totalScorePossible
    ) {
        Campaign storage c = campaigns[_id];
        return (
            c.creator, c.goal, c.deadline, c.totalRaised,
            c.currentBalance, c.isFailed, c.currentMilestone,
            c.platformFeeBPS, c.totalScorePossible
        );
    }

    function getCampaignBalances(uint _id) external view validCampaign(_id) returns (uint contributorBalance, uint lockedRiskDeposit) {
        Campaign storage c = campaigns[_id];
        return (c.currentBalance, c.riskDeposit);
    }

    // 【修改名稱】對齊報告中的 calculateVotingPower
    function calculateVotingPower(address _voter) public view returns (uint) {
        if (rawVoterScore[_voter] == 0) return 10;
        return rawVoterScore[_voter];
    }

    // --- Core Internal & Write Functions ---
    // 【修改名稱】對齊報告中的 updateReputation
    function updateReputation(address _voter) internal {
        PendingVote memory pv = lastVoteRecord[_voter];

        if (!pv.active) return;
        if (pv.campaignId == 0 || pv.campaignId > campaignCount) {
            delete lastVoteRecord[_voter];
            return;
        }
        Campaign storage c = campaigns[pv.campaignId];
        Milestone storage m = c.milestones[pv.milestoneId];
        if (m.approved || c.isFailed) {
            bool outcomeWasSupport = m.approved;
            uint currentScore = calculateVotingPower(_voter); // 同步呼叫新名稱
            if (pv.support == outcomeWasSupport) {
                if (currentScore < 20) rawVoterScore[_voter] = currentScore + 1;
            } else {
                if (currentScore > 5) rawVoterScore[_voter] = currentScore - 1;
            }
            delete lastVoteRecord[_voter];
        }
    }

    // SECURITY FIX: 加上 nonReentrant 防止重入
    function createCampaign(uint _goal, uint _duration, uint _numMilestones) external payable nonReentrant {
        require(_numMilestones > 0 && _numMilestones <= 10, "Invalid milestones");

        uint totalETH = totalSuccessfulVolume[msg.sender] / 1 ether;
        uint reduction = totalETH * REDUCTION_PER_ETH;
        uint fee = INITIAL_FEE_BPS > reduction ? INITIAL_FEE_BPS - reduction : MIN_FEE_BPS;
        if (fee < MIN_FEE_BPS) fee = MIN_FEE_BPS;
        uint requiredDeposit = BASE_RISK_DEPOSIT + (abandonedCount[msg.sender] * PENALTY_PER_ABANDON);
        require(msg.value >= requiredDeposit, "Insufficient deposit");
        campaignCount++;
        Campaign storage c = campaigns[campaignCount];
        c.creator = payable(msg.sender);
        c.goal = _goal;
        c.deadline = block.timestamp + _duration;
        c.numMilestones = _numMilestones;

        c.riskDeposit = requiredDeposit;
        c.platformFeeBPS = fee;
        uint baseAmount = _goal / _numMilestones;
        uint remainder = _goal % _numMilestones;
        for(uint i = 0; i < _numMilestones; i++) {
            c.milestones[i].amount = (i == 0) ? baseAmount + remainder : baseAmount;
        }
        emit CampaignCreated(campaignCount, msg.sender, _goal, requiredDeposit, fee);
        uint overage = msg.value - requiredDeposit;
        if (overage > 0) {
            (bool success, ) = payable(msg.sender).call{value: overage}("");
            require(success, "Overage refund failed");
        }
    }

    // SECURITY FIX: 加上 nonReentrant
    function contribute(uint _id) external payable validCampaign(_id) nonReentrant {
        Campaign storage c = campaigns[_id];
        require(block.timestamp < c.deadline, "Ended");
        require(!c.isFailed, "Failed");
        require(msg.value > 0, "No contribution");
        if (contributions[_id][msg.sender] == 0) {
            uint score = calculateVotingPower(msg.sender); // 同步呼叫新名稱
            c.lockedVoterScore[msg.sender] = score;
            c.totalScorePossible += score;
        }

        c.totalRaised += msg.value;
        c.currentBalance += msg.value;
        contributions[_id][msg.sender] += msg.value;
        emit ContributionReceived(_id, msg.sender, msg.value);
    }

    // 【修改名稱與參數】由 requestMilestoneRelease 改為對齊報告的 submitMilestoneEvidence，並允許輸入證明網址字串
    function submitMilestoneEvidence(uint _id, string calldata _evidenceLink) external validCampaign(_id) {
        Campaign storage campaign = campaigns[_id];
        require(msg.sender == campaign.creator && !campaign.isFailed, "Unauthorized");
        require(campaign.currentMilestone < campaign.numMilestones, "Finished");

        Milestone storage m = campaign.milestones[campaign.currentMilestone];
        require(!m.votingStarted, "Voting active");

        m.votingStarted = true;
        m.votingDeadline = block.timestamp + 48 hours;
        
        // 觸發事件並將創作者傳入的連結廣播到區塊鏈日誌中
        emit MilestoneRequested(_id, campaign.currentMilestone, m.votingDeadline, _evidenceLink);
    }

    // SECURITY FIX: 加上 nonReentrant 確保代幣與狀態安全
    function voteOnMilestone(uint _id, bool _support) external validCampaign(_id) nonReentrant {
        updateReputation(msg.sender); // 同步呼叫新名稱

        require(!lastVoteRecord[msg.sender].active, "Resolve previous vote outcome first");
        Campaign storage c = campaigns[_id];
        Milestone storage m = c.milestones[c.currentMilestone];
        require(m.votingStarted && block.timestamp <= m.votingDeadline, "No active vote");
        require(contributions[_id][msg.sender] > 0, "Not a contributor");
        require(!hasVoted[_id][c.currentMilestone][msg.sender], "Already voted");
        hasVoted[_id][c.currentMilestone][msg.sender] = true;

        uint score = c.lockedVoterScore[msg.sender];

        if (_support) { m.supportScore += score; }
        else { m.objectionScore += score; }
        lastVoteRecord[msg.sender] = PendingVote(_id, c.currentMilestone, _support, true);

        emit Voted(_id, c.currentMilestone, msg.sender, _support, score);
        if (m.objectionScore * 100 > c.totalScorePossible * 30) {
            c.isFailed = true;
            abandonedCount[c.creator]++;
            emit CampaignBlocked(_id, m.objectionScore);
        }
        
        uint random = uint(keccak256(abi.encodePacked(block.timestamp, msg.sender, block.prevrandao))) % 100;
        if (random < 10 && takoToken.balanceOf(address(this)) >= TAKO_REWARD_AMOUNT) {
            takoToken.transfer(msg.sender, TAKO_REWARD_AMOUNT);
            emit RewardIssued(msg.sender, TAKO_REWARD_AMOUNT);
        }
    }

    // SECURITY FIX: 加上 nonReentrant
    // 【修改名稱】由 executeRelease 改為對齊報告的 withdrawReleasedFunds
    function withdrawReleasedFunds(uint _id) external validCampaign(_id) nonReentrant {
        Campaign storage c = campaigns[_id];
        uint currentM = c.currentMilestone;
        Milestone storage m = c.milestones[currentM];
        require(m.votingStarted && block.timestamp > m.votingDeadline && !c.isFailed, "Not ready");
        m.approved = true;
        m.votingStarted = false;
        uint payoutBase = (currentM == c.numMilestones - 1) ? c.currentBalance : m.amount;
        uint feeAmount = (payoutBase * c.platformFeeBPS) / 10000;
        uint creatorPayout = payoutBase - feeAmount;
        if (currentM == c.numMilestones - 1) {
            creatorPayout += c.riskDeposit;
            c.riskDeposit = 0;
            totalSuccessfulVolume[c.creator] += c.totalRaised;
        }
        c.currentBalance -= payoutBase;
        c.currentMilestone++;
        if (feeAmount > 0) {
            (bool feeSuccess, ) = payable(platformAddress).call{value: feeAmount}("");
            require(feeSuccess, "Fee transfer failed");
        }

        (bool success, ) = payable(c.creator).call{value: creatorPayout}("");
        require(success, "Creator payout failed");
        emit MilestoneReleased(_id, currentM, creatorPayout);
    }

    // SECURITY FIX: 加上 nonReentrant
    // 【修改名稱】由 getRefund 改為對齊報告的 requestRefund
    function requestRefund(uint _id) external validCampaign(_id) nonReentrant {
        Campaign storage c = campaigns[_id];
        require(c.isFailed || (block.timestamp >= c.deadline && c.totalRaised < c.goal), "Not eligible");

        uint contributedAmount = contributions[_id][msg.sender];
        require(contributedAmount > 0, "No funds");
        uint refundAmount = (contributedAmount * c.currentBalance) / c.totalRaised;
        if (refundAmount > c.currentBalance) refundAmount = c.currentBalance;
        c.totalScorePossible -= c.lockedVoterScore[msg.sender];
        c.lockedVoterScore[msg.sender] = 0;
        contributions[_id][msg.sender] = 0;
        c.currentBalance -= refundAmount;
        c.totalRaised -= contributedAmount;
        emit Refunded(_id, msg.sender, refundAmount);
        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund transfer failed");
    }

    // SECURITY FIX: 加上 nonReentrant
    function recoverRiskDeposit(uint _id) external validCampaign(_id) nonReentrant {
        Campaign storage campaign = campaigns[_id];
        require(msg.sender == campaign.creator, "Only creator");
        require(!campaign.isFailed, "Blocked creators lose deposit");
        require(block.timestamp >= campaign.deadline && campaign.totalRaised < campaign.goal, "Goal met or active");

        uint amount = campaign.riskDeposit;
        campaign.riskDeposit = 0;
        emit RiskDepositRecovered(_id, campaign.creator, amount);

        (bool success, ) = payable(campaign.creator).call{value: amount}("");
        require(success, "Deposit recovery failed");
    }
}
