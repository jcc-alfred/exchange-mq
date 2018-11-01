create table if not exists m_kline
(
	id bigint auto_increment
		primary key,
	coin_exchange_id_range varchar(50) not null,
	datestamp timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
	timestamp bigint not null,
	open_price decimal(20,8) not null,
	close_price decimal(20,8) not null,
	high_price decimal(20,8) not null,
	low_price decimal(20,8) not null,
	volume decimal(20,8) not null,
	constraint coin_kline_range
		unique (coin_exchange_id_range, timestamp)
)
comment 'K线数据';