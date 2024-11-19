#!/bin/bash

#ドメインを入力させる
echo -n ドメイン名を入力してください:
read domain
echo $domain

#各種鍵の保管場所作成
current=$(cd $(dirname $0);pwd)
dir="${current}/certdir/"
mkdir ${dir}

#プライベートルート証明書の作成
openssl genrsa -out ${dir}privaterootca.key 2048
openssl req  -new -x509 -key ${dir}privaterootca.key -sha256  -days 366 -extensions v3_ca  -out ${dir}myrootca.pem  -subj "/C=JP/ST=Osaka/O=mycorp./CN=testCN"

#中間証明書の作成
openssl genrsa -out ${dir}myintermediateca.key 2048
openssl req -new -key ${dir}myintermediateca.key -sha256 -outform PEM -keyform PEM -out ${dir}myintermediateca.csr  -subj "/C=JP/ST=Osaka/O=mycorp./CN=testCN"
touch ${dir}myintermediateca.cnf
echo "[ v3_ca ]" >> ${dir}myintermediateca.cnf
echo "basicConstraints = CA:true, pathlen:0" >> ${dir}myintermediateca.cnf
echo "keyUsage = cRLSign, keyCertSign" >> ${dir}myintermediateca.cnf
echo "nsCertType = sslCA, emailCA" >> ${dir}myintermediateca.cnf
openssl x509 -extfile ${dir}myintermediateca.cnf -req -in ${dir}myintermediateca.csr -sha256 -CA ${dir}myrootca.pem -CAkey ${dir}privaterootca.key -set_serial 01  -extensions v3_ca  -days 366 -out ${dir}myintermediateca.pem

#サーバ証明書の作成
openssl genrsa 2048 > ${dir}myserver.key
openssl req -new -key ${dir}myserver.key -outform PEM -keyform PEM  -sha256 -out ${dir}myserver.csr  -subj "/C=JP/ST=Osaka/O=mycorp./CN=*.${domain}"
openssl x509 -req -in ${dir}myserver.csr -sha256 -CA ${dir}myintermediateca.pem -CAkey ${dir}myintermediateca.key -set_serial 01 -days 366 -out ${dir}myserver.pem

#AWS ACMへ証明書をインポートする
aws acm import-certificate --certificate fileb://${dir}myserver.pem --private-key fileb://${dir}myserver.key --certificate-chain fileb://${dir}myintermediateca.pem