import "./AccountsScanner.css";
import { TokenAccount } from "../../interfaces/TokenAccount";
import "./Account.css";

interface AccountProps {
  index: number;
  account: TokenAccount;
  scanTokenAccounts: (arg0: boolean) => void;
  onSelectAccount: (pubkey: string, isSelected: boolean) => void;
}

function AccountWithBalance(props: AccountProps) {
  //   const { publicKey, signTransaction } = useWallet();

  const account = props.account;

  return (
    <>
      <div
        key={account.pubkey}
        className="account-item"
        style={{ animationDelay: `${props.index * 0.1}s` }}
      >
        <article className="account" key={account.pubkey}>
          <div className="account-info">
            <div style={{ display: "flex", gap: "20px" }}>
              <input
                type="checkbox"
                onChange={(e) =>
                  props.onSelectAccount(account.pubkey, e.target.checked)
                }
              />
              <img src={account.logo} alt={account.name} />
            </div>
            <p>
              <b>{account.name}</b>
            </p>
            <p>
              <b>
                {account.balance} {account.symbol}
              </b>
            </p>
            <a
              href={"https://solscan.io/token/" + account.mint}
              target="_blank"
            >
              <b>{account.mint.toString().substring(0, 20)}...</b>
            </a>
          </div>
        </article>
      </div>
    </>
  );
}

export default AccountWithBalance;
