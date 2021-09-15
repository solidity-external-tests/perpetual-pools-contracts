import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    createCommit,
    deployPoolAndTokenContracts,
    deployPoolSetupContracts,
    generateRandomAddress,
    timeout,
} from "../../utilities"

import {
    DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
    DEFAULT_MINT_AMOUNT,
    DEFAULT_MIN_COMMIT_SIZE,
    POOL_CODE,
} from "../../constants"
import {
    PoolKeeper,
    ChainlinkOracleWrapper,
    TestToken,
    TestChainlinkOracle,
    PoolCommitter,
    LeveragedPool,
} from "../../../types"
import { BigNumber } from "ethers"
import { Result } from "ethers/lib/utils"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

let derivativeChainlinkOracle: TestChainlinkOracle
let derivativeOracleWrapper: ChainlinkOracleWrapper
let poolKeeper: PoolKeeper
let pool: any
let poolCommitter: PoolCommitter
let pool2: any
let POOL1_ADDR: string
let POOL2_ADDR: string
let signers: SignerWithAddress[]
let token: TestToken

const updateInterval = 10
const frontRunningInterval = 1
const fee = ethers.utils.parseEther("0.5")
const mintAmount = DEFAULT_MINT_AMOUNT

const setupHook = async () => {
    signers = await ethers.getSigners()
    /* NOTE: settlementToken in this test is the same as the derivative oracle */
    const contracts1 = await deployPoolAndTokenContracts(
        POOL_CODE,
        frontRunningInterval,
        updateInterval,
        1,
        DEFAULT_MIN_COMMIT_SIZE,
        DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
        signers[0].address,
        fee
    )
    poolCommitter = contracts1.poolCommitter
    token = contracts1.token
    pool = contracts1.pool
    poolKeeper = contracts1.poolKeeper
    derivativeChainlinkOracle = contracts1.chainlinkOracle
    derivativeOracleWrapper = contracts1.oracleWrapper
    await token.approve(pool.address, mintAmount)
    await timeout(updateInterval * 1000 * 2)
    await pool.setKeeper(signers[0].address)
    await pool.poolUpkeep(9, 10)
    POOL1_ADDR = pool.address
}

interface Upkeep {
    cumulativePrice: BigNumber
    lastSamplePrice: BigNumber
    executionPrice: BigNumber
    lastExecutionPrice: BigNumber
    count: number
    updateInterval: number
    roundStart: number
}
describe("Leveraged pool fees", () => {
    it("Should revert if fee above 100%", async () => {
        let lastTime: BigNumber

        const setupContracts = await deployPoolSetupContracts()

        // deploy the pool using the factory, not separately
        const deployParams = {
            poolName: POOL_CODE,
            frontRunningInterval: frontRunningInterval,
            updateInterval: updateInterval,
            leverageAmount: 1,
            quoteToken: setupContracts.token.address,
            oracleWrapper: setupContracts.oracleWrapper.address,
            settlementEthOracle: setupContracts.settlementEthOracle.address,
            minimumCommitSize: 120,
            maximumCommitQueueLength: 1000,
        }

        await setupContracts.factory.setFee(ethers.utils.parseEther("100"))
        await expect(
            setupContracts.factory.deployPool(deployParams)
        ).to.be.revertedWith("Fee >= 100%")
    })

    describe("Fees on price change", () => {
        let lastTime: BigNumber

        before(async () => {
            await setupHook()
            // process a few upkeeps
            lastTime = await pool.lastPriceTimestamp()
            await timeout(updateInterval * 1000 + 1000)
            await pool.setKeeper(poolKeeper.address)
        })

        it("Takes the right fee amount", async () => {
            await createCommit(poolCommitter, [2], mintAmount.div(2))
            await createCommit(poolCommitter, [0], mintAmount.div(2))
            await timeout(updateInterval * 1000 + 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            await timeout(updateInterval * 1000 + 1000)

            await poolKeeper.performUpkeepSinglePool(pool.address)


            // We are OK with small amounts of dust being left in the contract because
            // over-collateralised pools are OK
            const approxKeeperFee = mintAmount.div(2)
            let fees = await pool.feesAccumulated()
            fees = fees.div(ethers.utils.parseEther("1"))
            const epsilon = ethers.utils
                .parseEther("0.000001")
                .add(approxKeeperFee)
            const upperBound = approxKeeperFee.div(2).add(epsilon)
            const lowerBound = approxKeeperFee.div(2).sub(epsilon)
            //@ts-ignore
            expect(fees).to.be.within(lowerBound, upperBound)

            
            let longBalBefore = await pool.longBalance()
            let shortBalBefore = await pool.shortBalance()
            await pool.withdrawFees()
            let longBalAfter = await pool.longBalance()
            let shortBalAfter = await pool.shortBalance()
            expect(longBalBefore.sub(longBalAfter)).to.equal(fees.div(2))
            expect(shortBalBefore.sub(shortBalAfter)).to.equal(fees.div(2))
        })
    })
})
