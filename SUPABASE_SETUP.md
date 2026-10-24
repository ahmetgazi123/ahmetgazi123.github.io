# Supabase kurulumu

Uygulama, aynı Supabase hesabıyla oturum açan cihazlar arasında fasoncu, iş, teslimat notu ve Fatih Baskı kayıtlarını senkronize eder. Giriş yapılmadan veriler buluta aktarılmaz.
Giriş ekranındaki **Beni hatırla** seçeneği oturumu cihazda kalıcı tutar; seçim kaldırılırsa oturum yalnızca mevcut tarayıcı oturumu boyunca saklanır.

## 1. Supabase projesi oluşturun

1. [Supabase](https://supabase.com/dashboard) üzerinden yeni bir proje oluşturun.
2. SQL Editor'de `supabase/schema.sql` dosyasının tamamını çalıştırın. Bu işlem kullanıcı başına tek bir JSONB kayıt alanı, kullanıcıya özel RLS politikaları ve gerçek zamanlı yayın tablosunu oluşturur.
3. **Project Settings → API** bölümünden Project URL ile `anon`/publishable anahtarını alın. `service_role` anahtarını tarayıcıya veya GitHub'a koymayın.

## 2. Yerel bağlantı

Proje kökünde `.env.local` dosyasını oluşturup değerleri girin:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Geliştirme sunucusunu yeniden başlatın (`npm run dev`). `.env.local` Git'e eklenmez. `NEXT_PUBLIC_` değerleri tarayıcıya gönderilir; bu nedenle yalnızca Supabase'in publishable/anon anahtarını kullanın. Güvenliği RLS politikaları sağlar.

## 3. İlk giriş ve cihazdaki kayıtları aktarma

Uygulamadaki hesap oluşturma ekranından bir kullanıcı oluşturun ve aynı hesapla diğer cihazlarda giriş yapın. Supabase e-posta doğrulaması açıksa gelen doğrulama bağlantısını onaylayın.

İlk girişte `user_data` satırı henüz yoksa o tarayıcıdaki mevcut fasoncu ve Fatih Baskı kayıtları buluta bir kez aktarılır. Bulutta veri varsa buluttaki kayıtlar kullanılır; yerel kayıtlar buluttaki verinin üzerine yazılmaz.

## 4. GitHub Pages

Bu proje için GitHub deposu `ahmetgazi123/ahmetgazi123.github.io`, yayın adresi ise `https://ahmetgazi123.github.io` olmalıdır.

GitHub deposunda **Settings → Secrets and variables → Actions → New repository secret** bölümüne şu iki secret'ı ekleyin:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

`deploy.yml` bu secret'ları build sırasında zaten kullanacak şekilde ayarlıdır. `NEXT_PUBLIC_` değerleri statik JavaScript'e build sırasında eklendiği için secret'ları ekledikten sonra `main` dalına yeni bir push göndererek yeniden build/deploy başlatın.

E-posta doğrulamasında Supabase **Authentication → URL Configuration** ayarlarında **Site URL** olarak `https://ahmetgazi123.github.io` girin ve **Redirect URLs** listesine `https://ahmetgazi123.github.io/**` ile `http://localhost:3000/**` adreslerini ekleyin.
