-- Run this once in Supabase → SQL Editor

create table if not exists products (
  id bigint primary key,
  shopee_product_id text,
  name text,
  price numeric,
  max_price numeric,
  is_bestseller boolean default false,
  on_discount boolean default false,
  is_new boolean default false,
  in_stock boolean default true,
  stock integer default 0,              -- total across variants
  display_tags jsonb default '[]',
  images jsonb default '[]',
  sizes jsonb default '[]',
  colors jsonb default '[]',
  variants jsonb default '[]'           -- [{variationId,color,size,price,stock}]
);

create table if not exists orders (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  customer_name text not null,
  phone text not null,
  address text not null,
  note text,
  payment_method text not null check (payment_method in ('transfer','cod')),
  status text not null default 'pending',  -- pending | paid | shipped | done | cancelled
  items jsonb not null,
  total numeric not null
);

create table if not exists messages (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  name text not null,
  email text not null,
  message text not null
);

alter table products enable row level security;
alter table orders   enable row level security;
alter table messages enable row level security;

-- products: public read, only signed-in admin writes
create policy "products read"  on products for select using (true);
create policy "products write" on products for all to authenticated using (true) with check (true);
-- orders: nobody inserts directly (place_order() does it); admin reads/updates
create policy "orders read"   on orders for select to authenticated using (true);
create policy "orders update" on orders for update to authenticated using (true);
-- messages: anyone can send, admin reads
create policy "messages send" on messages for insert to anon, authenticated with check (true);
create policy "messages read" on messages for select to authenticated using (true);

-- Atomic checkout: validates stock, decrements it, computes the total server-side
create or replace function place_order(
  p_name text, p_phone text, p_address text, p_note text,
  p_payment text, p_items jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; v jsonb; prod products%rowtype;
  qty int; vprice numeric; total numeric := 0; lines jsonb := '[]'; oid bigint;
begin
  if p_payment not in ('transfer','cod') then raise exception 'Invalid payment method'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    qty := (it->>'qty')::int;
    if qty is null or qty < 1 then raise exception 'Invalid quantity'; end if;

    select * into prod from products where id = (it->>'productId')::bigint for update;
    if not found then raise exception 'Product not found'; end if;

    select x.value into v from jsonb_array_elements(prod.variants) x
      where x.value->>'variationId' = it->>'variationId';
    if v is null then raise exception 'Variant not found for %', prod.name; end if;
    if coalesce((v->>'stock')::int, 0) < qty then
      raise exception 'Not enough stock for %', prod.name;
    end if;

    update products set
      variants = (
        select jsonb_agg(
          case when x.value->>'variationId' = it->>'variationId'
               then jsonb_set(x.value, '{stock}', to_jsonb(coalesce((x.value->>'stock')::int,0) - qty))
               else x.value end)
        from jsonb_array_elements(variants) x),
      stock = coalesce(stock,0) - qty,
      in_stock = (coalesce(stock,0) - qty) > 0
    where id = prod.id;

    vprice := coalesce((v->>'price')::numeric, prod.price);
    total := total + vprice * qty;
    lines := lines || jsonb_build_object(
      'productId', prod.id, 'variationId', it->>'variationId', 'name', prod.name,
      'color', v->>'color', 'size', v->>'size', 'price', vprice, 'qty', qty);
  end loop;

  insert into orders (customer_name, phone, address, note, payment_method, items, total)
  values (p_name, p_phone, p_address, p_note, p_payment, lines, total)
  returning id into oid;
  return oid;
end $$;

grant execute on function place_order(text,text,text,text,text,jsonb) to anon, authenticated;
