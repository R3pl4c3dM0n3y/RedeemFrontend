

export interface TokenAccount {
    pubkey: string;
    mint: string;
    balance: number;
    name?: string;
    symbol?: string;
    logo?: string
    rentAmount?: number;
}
