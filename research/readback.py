import json, urllib.request, time
from Crypto.Hash import keccak
RPC="https://rpc.test.mezo.org"
def rpc(m,p):
    r=urllib.request.Request(RPC,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"content-type":"application/json","user-agent":"curl/8.5.0"})
    return json.load(urllib.request.urlopen(r,timeout=30))
def sel(sig): k=keccak.new(digest_bits=256); k.update(sig.encode()); return k.hexdigest()[:8]
def call(to,sig,args=""):
    return rpc("eth_call",[{"to":to,"data":"0x"+sel(sig)+args},"latest"])
A={"MUSD":"0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503","TroveManager":"0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
"BorrowerOperations":"0xCdF7028ceAB81fA0C6971208e83fa7872994beE5","BorrowerOperationsSignatures":"0xD757e3646AF370b15f32EB557F0F8380Df7D639e",
"PriceFeed":"0x86bCF0841622a5dAC14A313a15f96A95421b9366","SortedTroves":"0x722E4D24FD6Ff8b0AC679450F3D91294607268fA",
"HintHelpers":"0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6","InterestRateManager":"0xD4D6c36A592A2c5e86035A6bca1d57747a567f37"}
print("chainId",int(rpc("eth_chainId",[])["result"],16)); b=rpc("eth_getBlockByNumber",["latest",False])["result"]; print("block",int(b["number"],16),time.strftime('%Y-%m-%d %H:%M:%S UTC',time.gmtime(int(b["timestamp"],16))))
for n,a in A.items():
    c=rpc("eth_getCode",[a,"latest"])["result"]; print(f"{n:30} code bytes={len(c)//2-1}")
def u(r): return int(r["result"],16) if "result" in r else r.get("error")
def s(r):
    if "error" in r: return r["error"]
    h=r["result"][2:]; l=int(h[64:128],16); return bytes.fromhex(h[128:128+2*l]).decode()
print("MUSD symbol",s(call(A["MUSD"],"symbol()")),"totalSupply",u(call(A["MUSD"],"totalSupply()"))/1e18)
p=call(A["PriceFeed"],"fetchPrice()"); print("fetchPrice",p if "error" in p else int(p["result"],16)/1e18)
print("MCR",u(call(A["TroveManager"],"MCR()"))/1e18, "troveOwners",u(call(A["TroveManager"],"getTroveOwnersCount()")))
print("SortedTroves size",u(call(A["SortedTroves"],"getSize()")))
print("TM.borrowerOperationsAddress",call(A["TroveManager"],"borrowerOperationsAddress()").get("result"))
price=int(p["result"],16)
def addr_arg(a): return a[2:].lower().rjust(64,"0")
last=call(A["SortedTroves"],"getLast()")["result"]; borrower="0x"+last[-40:]
r=call(A["TroveManager"],"getEntireDebtAndColl(address)",addr_arg(borrower))["result"][2:]
coll,principal,interest,pc,pp,pi=[int(r[i:i+64],16) for i in range(0,384,64)]
rate=u(call(A["TroveManager"],"getTroveInterestRate(address)",addr_arg(borrower)))
icr=u(call(A["TroveManager"],"getCurrentICR(address,uint256)",addr_arg(borrower)+hex(price)[2:].rjust(64,"0")))
debt=principal+interest
print("lowest-ICR trove",borrower,"coll BTC",coll/1e18,"principal",principal/1e18,"interest",interest/1e18,"rate bips",rate)
print("ICR on-chain",icr/1e18,"ICR recomputed",coll*price/debt/1e18 if debt else None)
if rate and debt:
    per_sec=principal*rate/10000/(365*24*3600)
    t=(coll*price/1.1e18-debt)/per_sec
    print("days to 110% at flat price", t/86400)
print("sig nonce of borrower",u(call(A["BorrowerOperationsSignatures"],"getNonce(address)",addr_arg(borrower))))
