// WARHEADZ runs on the redeployed test-chain stack (the pad with launch deals, the venue check and the game contracts), not on the
// older stack the SDK ships with. The addresses are from the committed record `engine/deployments/vyreTest-badlands.json`
// (commit 996bbeb of the chain repo). The pad's launch call is the same, so the rest of the app needs no change. The rollup
// addresses are the same chain's, so they are kept from the SDK.
import { getAddresses, registerDeployment } from '@vyrechain/sdk';

const TESTNET = 7357;
const old = getAddresses(TESTNET);

registerDeployment(TESTNET, {
  pad: '0xfF470f8ba34fE504Bb0936876Ed1da777B066482',
  poolFactory: '0x81bB75d39C08F5B4a06Fcfb87E22377306496276',
  poolDeployer: '0xc4D37Bf7447BFf9B1a7Ed67C054469C896037d86',
  feeSplitter: '0x2910D1DF15C097F5b62b14579e1E1e0b77d66bd6',
  appRouter: '0x7683248C3Df99E2722E13207954784EA65981B37',
  swapRouter: '0x369F27866710154c006b735AF9D1117b8f5fA167',
  quoter: '0xd8578a79f38b32190D5263bf8d85438822480E21',
  tickLens: '0x1E208E8897a95A2D8A59Da4CA38433b4662e07df',
  referrals: '0x23e6EBCa24BEa6a7165F33544327A435e56ec26D',
  wusdc: '0xb91D02eD730f9FC02e300349764C522c75E55391',
  startBlock: 5890,
  rollup: old.rollup,
});
