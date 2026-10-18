"""Romanization for alignment (the same rules go into the app): Telugu by table, English letters kept, numbers spelt out."""
import re
VOW={'అ':'a','ఆ':'aa','ఇ':'i','ఈ':'ii','ఉ':'u','ఊ':'uu','ఋ':'ra','ౠ':'rra','ఌ':'la','ఎ':'e','ఏ':'ee','ఐ':'ai','ఒ':'o','ఓ':'oo','ఔ':'au'}
CON={'క':'k','ఖ':'kh','గ':'g','ఘ':'gh','ఙ':'ng','చ':'c','ఛ':'ch','జ':'j','ఝ':'jh','ఞ':'ny','ట':'tt','ఠ':'tth','డ':'dd','ఢ':'ddh','ణ':'nn',
     'త':'t','థ':'th','ద':'d','ధ':'dh','న':'n','ప':'p','ఫ':'ph','బ':'b','భ':'bh','మ':'m','య':'y','ర':'r','ఱ':'rr','ల':'l','ళ':'ll','ఴ':'lll',
     'వ':'v','శ':'sh','ష':'ss','స':'s','హ':'h'}
SIGN={'ా':'aa','ి':'i','ీ':'ii','ు':'u','ూ':'uu','ృ':'ra','ౄ':'rra','ె':'e','ే':'ee','ై':'ai','ొ':'o','ో':'oo','ౌ':'au'}
VIRAMA='్'
ONES="zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS="_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
def num(n):
    if n<20: return ONES[n]
    if n<100: return TENS[n//10]+("" if n%10==0 else ONES[n%10])
    if n<1000: return ONES[n//100]+"hundred"+("" if n%100==0 else num(n%100))
    if n<1000000: return num(n//1000)+"thousand"+("" if n%1000==0 else num(n%1000))
    return "".join(ONES[int(d)] for d in str(n))
def rom(w):
    out=[]; i=0; s=w.lower()
    while i<len(s):
        c=s[i]
        if c in CON:
            out.append(CON[c]); nx=s[i+1] if i+1<len(s) else ''
            if nx in SIGN: out.append(SIGN[nx]); i+=2; continue
            if nx==VIRAMA: i+=2; continue
            out.append('a'); i+=1; continue
        if c in VOW: out.append(VOW[c])
        elif c=='ం': out.append('m')
        elif c=='ః': out.append('h')
        elif '౦'<=c<='౯': out.append(str(ord(c)-ord('౦')))
        elif 'a'<=c<='z' or c=="'" or '0'<=c<='9': out.append(c)
        i+=1
    r="".join(out)
    r=re.sub(r"[0-9]+",lambda m: num(int(m.group())) if len(m.group())<=6 else "".join(ONES[int(d)] for d in m.group()),r)
    return r.strip("'")
