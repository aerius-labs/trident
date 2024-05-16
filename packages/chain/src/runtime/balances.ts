import { runtimeModule, state, runtimeMethod } from "@proto-kit/module";
import { StateMap, assert } from "@proto-kit/protocol";
import { Balance, Balances as BaseBalances, TokenId, UInt64 } from "@proto-kit/library";
import { PublicKey } from "o1js";

interface BalancesConfig {
  totalSupply: Balance;
}

@runtimeModule()
export class Balances extends BaseBalances<BalancesConfig> {
  @state() public supply = StateMap.from<TokenId, Balance>(
      TokenId,
      Balance
  );

  public getTotalSupply(tokenId: TokenId): Balance {
    return Balance.from(this.supply.get(tokenId).value);
  }

  public mintAndIncrementSupply(
      tokenId: TokenId,
      address: PublicKey,
      amount: Balance
  ): void {
    const totalSupply = this.supply.get(tokenId);
    const newTotalSupply = Balance.from(totalSupply.value).add(amount);
    this.supply.set(tokenId, newTotalSupply);
    this.mint(tokenId, address, amount);
  }

  public burnAndDecrementSupply(
      tokenId: TokenId,
      address: PublicKey,
      amount: Balance
  ): void {
    const totalSupply = this.supply.get(tokenId);
    const newTotalSupply = Balance.from(totalSupply.value).sub(amount);
    this.supply.set(tokenId, newTotalSupply);
    this.burn(tokenId, address, amount);
  }

  @runtimeMethod()
  public transferSigned(
      tokenId: TokenId,
      from: PublicKey,
      to: PublicKey,
      amount: Balance
  ): void {
    this.transfer(tokenId, from, to, amount);
  }

  // @runtimeMethod()
  // public mintSigned(tokenId: TokenId, amount: Balance): void {
  //   const recipient = this.transaction.sender.value;
  //   this.mintAndIncrementSupply(tokenId, recipient, amount);
  // }

  @runtimeMethod()
  public burnSigned(tokenId: TokenId, amount: Balance): void {
    const sender = this.transaction.sender.value;
    this.burnAndDecrementSupply(tokenId, sender, amount);
  }
}